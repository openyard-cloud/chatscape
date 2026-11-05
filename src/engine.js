// Chatscape engine: a grid of character cells, the layer painters that fill
// it, and a renderer that draws the grid on a canvas. A theme is plain data
// (see themes.js): a list of layers, each naming one painter below.
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});

  const NONE = -1;
  // Cells are taller than wide; horizontal distances are scaled by this when
  // drawing round shapes so a disc looks round.
  const ASPECT = 1.8;

  // A stable pseudo-random number in [0, 1) for integer inputs.
  function hash(a, b = 0, c = 0) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const wrap = (v, m) => ((v % m) + m) % m;
  const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);

  function mix(a, b, k) {
    k = clamp01(k);
    const ch = (s) => {
      const p = (a >> s) & 255;
      return Math.round(p + (((b >> s) & 255) - p) * k);
    };
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }

  // Lightness turned over, hue and saturation kept: what CSS invert(1) hue-rotate(180deg)
  // does, near enough. Applied before that filter, it gives the colour back.
  function flipLightness(c) {
    const r = ((c >> 16) & 255) / 255, gr = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    const hi = Math.max(r, gr, b), lo = Math.min(r, gr, b);
    const shift = 1 - hi - lo; // moves the lightness (hi + lo) / 2 to 1 minus itself
    const ch = (v) => Math.round(clamp01(v + shift) * 255);
    return (ch(r) << 16) | (ch(gr) << 8) | ch(b);
  }

  const css = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

  class Grid {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.ch = new Uint16Array(w * h);
      this.fg = new Int32Array(w * h);
      this.bg = new Int32Array(w * h);
      this.rowBg = new Int32Array(h);
    }

    reset() {
      this.ch.fill(0);
      this.bg.fill(NONE);
      this.rowBg.fill(0);
    }

    index(x, y) {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
      return y * this.w + x;
    }

    // Puts one glyph (a space leaves the glyph alone) and an optional cell background.
    put(x, y, glyph, fg, bg) {
      const i = this.index(x, y);
      if (i < 0) return;
      if (glyph && glyph !== ' ') {
        this.ch[i] = glyph.charCodeAt(0);
        this.fg[i] = fg;
      }
      if (bg !== undefined) this.bg[i] = bg;
    }

    bgAt(x, y) {
      const i = this.index(x, y);
      if (i < 0) return 0;
      return this.bg[i] !== NONE ? this.bg[i] : this.rowBg[Math.round(y)];
    }

    text(x, y, str, fg) {
      for (let k = 0; k < str.length; k++) if (str[k] !== ' ') this.put(x + k, y, str[k], fg);
    }

    sprite(x, y, lines, fg) {
      lines.forEach((line, dy) => this.text(x, y + dy, line, fg));
    }
  }

  // Layer bounds are fractions of the grid's height: y0 = 0 top, y1 = 1 bottom.
  const rowsOf = (g, L) => {
    const a = Math.floor((L.y0 ?? 0) * g.h);
    const b = Math.max(a + 1, Math.ceil((L.y1 ?? 1) * g.h));
    return [a, Math.min(g.h, b)];
  };

  const spriteWidth = (lines) => Math.max(...lines.map((l) => l.length));

  // Each painter fills the grid for time t (seconds). `st` is a state object
  // kept per layer for painters that remember (life, skyline).
  const LAYERS = {
    // { from, to, y0, y1 }: a vertical background gradient.
    gradient(g, t, L) {
      const [a, b] = rowsOf(g, L);
      for (let y = a; y < b; y++) g.rowBg[y] = mix(L.from, L.to, b - a > 1 ? (y - a) / (b - a - 1) : 0);
    },

    // { density, glyphs, from, to, speed, y0, y1 }: twinkling stars.
    stars(g, t, L) {
      const [a, b] = rowsOf(g, L);
      for (let y = a; y < b; y++) {
        for (let x = 0; x < g.w; x++) {
          const r = hash(x, y, 7);
          if (r >= L.density) continue;
          const glow = 0.5 + 0.5 * Math.sin(t * (L.speed ?? 2) + r * 5000);
          g.put(x, y, pick(L.glyphs, hash(x, y, 9)), mix(L.from, L.to, glow));
        }
      }
    },

    // { density, speed, glyphs, fg, bg, y0, y1, seed }: puffy clouds of letters.
    clouds(g, t, L) {
      const [a, b] = rowsOf(g, L);
      const count = Math.max(2, Math.round(((L.density ?? 1) * g.w * (b - a)) / 400));
      for (let i = 0; i < count; i++) {
        const s = (L.seed ?? 1) * 97 + i;
        const cw = 8 + Math.floor(hash(s, 1) * 16);
        const chH = 2 + Math.floor(hash(s, 2) * 2);
        const y0 = a + Math.floor(hash(s, 3) * Math.max(1, b - a - chH));
        const speed = (L.speed ?? 1) * (0.5 + hash(s, 4));
        const x0 = wrap(hash(s, 5) * (g.w + cw) + t * speed, g.w + cw) - cw;
        for (let dy = 0; dy < chH; dy++) {
          for (let dx = 0; dx < cw; dx++) {
            const nx = (dx - cw / 2) / (cw / 2);
            const ny = (dy - (chH - 1) / 2) / (chH / 2 + 0.3);
            if (nx * nx + ny * ny < 1) g.put(x0 + dx, y0 + dy, pick(L.glyphs, hash(s, dx, dy)), L.fg, L.bg);
          }
        }
      }
    },

    // { x, y, r, glyphs, fg, bg, bite, glow }: a moon or sun; `bite` makes a crescent.
    // On an inverted canvas the disc is painted pre-flipped, so a sun stays a sun.
    disc(g, t, L) {
      const keep = (c) => (c === undefined || !g.flipped ? c : flipLightness(c));
      const fg = keep(L.fg ?? L.bg), bg = keep(L.bg), glow = keep(L.glow);
      let cx = L.x * g.w;
      const cy = L.y * g.h;
      const R = L.r;
      const reach = L.glow !== undefined ? R * 1.8 : R;
      // Keep the disc out of the reading lane and from under the sidebar: move it to the
      // middle of the free side it was on, or the other one, when it fits there (its
      // glow may spill over).
      if (g.lane) {
        const [l0, l1, side] = g.lane;
        const half = R * ASPECT + 1;
        if ((cx + half > l0 && cx - half < l1) || cx - half < side) {
          const right = g.w - l1 >= 2 * half, left = l0 - side >= 2 * half;
          if (right && (L.x >= 0.5 || !left)) cx = (l1 + g.w) / 2;
          else if (left) cx = (side + l0) / 2;
        }
      }
      for (let y = Math.floor(cy - reach); y <= cy + reach; y++) {
        for (let x = Math.floor(cx - reach * ASPECT); x <= cx + reach * ASPECT; x++) {
          const d = Math.hypot((x - cx) / ASPECT, y - cy);
          const bitten = L.bite && Math.hypot((x - cx - R * L.bite * ASPECT) / ASPECT, y - cy + R * 0.3) < R;
          if (d < R && !bitten) {
            g.put(x, y, L.glyphs ? pick(L.glyphs, hash(x, y, 3)) : ' ', fg, bg);
          } else if (L.glow !== undefined && d < reach && !bitten) {
            g.put(x, y, ' ', 0, mix(g.bgAt(x, y), glow, (1 - (d - R) / (reach - R)) * 0.45));
          }
        }
      }
    },

    // { glyphs, from, to, fx, fy, speed, fx2, speed2, threshold, y0, y1 }: rippling water.
    waves(g, t, L) {
      const [a, b] = rowsOf(g, L);
      for (let y = a; y < b; y++) {
        const fg = mix(L.from, L.to ?? L.from, (y - a) / Math.max(1, b - a - 1));
        for (let x = 0; x < g.w; x++) {
          const v =
            Math.sin(x * (L.fx ?? 0.35) + y * (L.fy ?? 1.7) + t * (L.speed ?? 1.2)) +
            0.5 * Math.sin(x * (L.fx2 ?? 0.13) - t * (L.speed2 ?? 0.8));
          if (v > (L.threshold ?? 1.1)) g.put(x, y, pick(L.glyphs, hash(x, y, 5)), fg);
        }
      }
    },

    // { density, min, glyphs, colors, vx, vy, wobble, wobbleSpeed, pulse, dim, glow, y0, y1 }:
    // drifting points: snow, petals, bubbles, fireflies, sparks.
    particles(g, t, L) {
      const [a, b] = rowsOf(g, L);
      const span = b - a;
      const count = Math.max(L.min ?? 4, Math.round(((L.density ?? 1) * g.w * span) / 1000));
      const ws = L.wobbleSpeed ?? 0.8;
      for (let i = 0; i < count; i++) {
        const s = 0.6 + 0.8 * hash(i, 3, 11);
        const x = wrap(hash(i, 1, 11) * g.w + (L.vx ?? 0) * s * t + Math.sin(t * ws + i) * (L.wobble ?? 0), g.w);
        const y = a + wrap(hash(i, 2, 11) * span + (L.vy ?? 0) * s * t + Math.cos(t * ws * 0.8 + i * 1.7) * (L.wobble ?? 0) * 0.4, span);
        const color = L.colors[i % L.colors.length];
        if (L.pulse) {
          const k = 0.5 + 0.5 * Math.sin(t * L.pulse + i * 7.1);
          if (k < 0.15) continue;
          const bg = L.glow !== undefined ? mix(g.bgAt(x, y), L.glow, k * 0.6) : undefined;
          g.put(x, y, k > 0.7 ? L.glyphs[L.glyphs.length - 1] : L.glyphs[0], mix(L.dim ?? g.bgAt(x, y), color, k), bg);
        } else {
          g.put(x, y, pick(L.glyphs, hash(i, 4, 11)), color);
        }
      }
    },

    // { items: [{ frames, left?, color }], count, speed, mode, dir, bob, sway, fps, rx, ry, y0, y1 }:
    // ASCII sprites that drift across, circle the middle, rise, or stay put.
    sprites(g, t, L) {
      const [a, b] = rowsOf(g, L);
      const count = L.count ?? L.items.length;
      const fps = L.fps ?? 2;
      for (let i = 0; i < count; i++) {
        const item = L.items[i % L.items.length];
        const frameAt = (frames) => frames[Math.floor(t * fps + i) % frames.length];
        const s = 0.7 + 0.6 * hash(i, 1, 13);
        const bob = Math.round(Math.sin(t * 1.5 + i * 2) * (L.bob ?? 0));
        let x;
        let y;
        let goingLeft = false;
        if (L.mode === 'orbit') {
          const ang = t * (L.speed ?? 0.3) * s + i * 2.1;
          x = g.w / 2 + Math.cos(ang) * g.w * (L.rx ?? 0.3) * (1 - i * 0.12);
          y = (a + b) / 2 + Math.sin(ang) * (b - a) * (L.ry ?? 0.3) * (1 - i * 0.1);
          goingLeft = Math.sin(ang) > 0;
        } else if (L.mode === 'rise') {
          const height = item.frames[0].length + 2;
          const lane = (i + 0.5) / count;
          x = lane * g.w + Math.sin(t * 0.5 + i * 2) * (L.sway ?? 3) - 3;
          y = b - wrap(t * (L.speed ?? 1) * s + hash(i, 2, 13) * (b - a + height), b - a + height);
        } else if (L.mode === 'still') {
          x = hash(i, 3, 13) * (g.w - 6);
          y = a + hash(i, 4, 13) * Math.max(1, b - a - 2);
        } else {
          const dir = L.dir ?? (i % 2 ? -1 : 1);
          const width = spriteWidth(item.frames[0]);
          const travel = wrap(hash(i, 5, 13) * (g.w + width) + dir * (L.speed ?? 2) * s * t, g.w + width);
          x = dir > 0 ? travel - width : g.w - travel;
          y = a + hash(i, 6, 13) * Math.max(1, b - a - item.frames[0].length);
          goingLeft = dir < 0;
        }
        const frames = goingLeft && item.left ? item.left : item.frames;
        g.sprite(Math.round(x), Math.round(y) + bob, frameAt(frames), item.color);
      }
    },

    // { glyphs: [left, straight, right], from, to, height, sway }: grass along the bottom.
    grass(g, t, L) {
      for (let x = 0; x < g.w; x++) {
        const tall = 1 + Math.floor(hash(x, 1, 17) * (L.height ?? 3));
        for (let k = 0; k < tall; k++) {
          const sway = Math.sin(t * (L.sway ?? 1.4) + x * 0.25 + k * 0.6);
          const blade = sway > 0.35 ? L.glyphs[0] : sway < -0.35 ? L.glyphs[2] : L.glyphs[1];
          g.put(x, g.h - 1 - k, blade, mix(L.from, L.to, hash(x, k, 19)));
        }
      }
    },

    // { density, glyphs, from, to, height: [min, max], sway, base }: seaweed or bamboo stalks.
    stalks(g, t, L) {
      const count = Math.max(2, Math.round((g.w * (L.density ?? 1)) / 10));
      for (let i = 0; i < count; i++) {
        const bx = (i + hash(i, 1, 23) * 0.7) * (g.w / count);
        const [lo, hi] = L.height ?? [0.2, 0.5];
        const tall = Math.round((lo + hash(i, 2, 23) * (hi - lo)) * g.h);
        const color = mix(L.from, L.to, hash(i, 3, 23));
        const base = g.h - 1 - (L.base ?? 0);
        for (let k = 0; k < tall; k++) {
          const sway = Math.sin(t * (L.sway ?? 1.3) + k * 0.4 + i);
          const glyph = L.glyphs.length > 1 ? (sway > 0 ? L.glyphs[0] : L.glyphs[1]) : L.glyphs[0];
          g.put(bx + Math.round(sway * k * 0.12), base - k, glyph, color);
        }
      }
    },

    // { rows, from, to, glyphs, fg, density }: sand, snow or earth along the bottom.
    ground(g, t, L) {
      for (let k = 0; k < L.rows; k++) {
        const y = g.h - L.rows + k;
        const bg = mix(L.from, L.to, L.rows > 1 ? k / (L.rows - 1) : 0);
        for (let x = 0; x < g.w; x++) {
          const glyph = L.glyphs && hash(x, y, 29) < (L.density ?? 0.2) ? pick(L.glyphs, hash(x, y, 31)) : ' ';
          g.put(x, y, glyph, L.fg ?? bg, bg);
        }
      }
    },

    // { density, glyphs, color, head, speed: [min, max], length: [min, max], flicker }: falling columns.
    columns(g, t, L) {
      const [vmin, vmax] = L.speed ?? [4, 12];
      const [lmin, lmax] = L.length ?? [4, 14];
      for (let x = 0; x < g.w; x++) {
        if (hash(x, 1, 37) > (L.density ?? 0.45)) continue;
        const speed = vmin + hash(x, 2, 37) * (vmax - vmin);
        const len = Math.round(lmin + hash(x, 3, 37) * (lmax - lmin));
        const head = Math.floor(wrap(t * speed + hash(x, 4, 37) * (g.h + len) * 3, g.h + len));
        for (let k = 0; k < len; k++) {
          const y = head - k;
          if (y < 0 || y >= g.h) continue;
          const glyph = pick(L.glyphs, hash(x, y, Math.floor(t * (L.flicker ?? 3))));
          const fg = k === 0 && L.head !== undefined ? L.head : mix(g.rowBg[y], L.color, 1 - k / len);
          g.put(x, y, glyph, fg);
        }
      }
    },

    // { count, period, length, glyph, color, y0, y1 }: shooting stars with fading tails.
    meteors(g, t, L) {
      const [a, b] = rowsOf(g, L);
      for (let i = 0; i < (L.count ?? 3); i++) {
        const period = (L.period ?? 6) * (0.7 + hash(i, 1, 41) * 0.6);
        const cycle = Math.floor((t + hash(i, 2, 41) * period) / period);
        const phase = ((t + hash(i, 2, 41) * period) % period) / period;
        if (phase > 0.35) continue;
        const k = phase / 0.35;
        const sx = hash(i, cycle, 43) * g.w * 0.8;
        const sy = a + hash(i, cycle, 47) * (b - a) * 0.5;
        const hx = sx + k * g.w * 0.35;
        const hy = sy + k * (b - a) * 0.3;
        const len = L.length ?? 8;
        for (let j = 0; j < len; j++) {
          const fade = 1 - j / len;
          g.put(hx - j * 2, hy - j * 0.85, j === 0 ? L.glyph ?? '*' : '-', mix(g.bgAt(hx - j * 2, hy - j * 0.85), L.color, fade));
        }
      }
    },

    // { colors, y0, y1, speed, glyphs }: aurora curtains.
    aurora(g, t, L) {
      const [a, b] = rowsOf(g, L);
      const span = b - a;
      L.colors.forEach((color, n) => {
        for (let x = 0; x < g.w; x++) {
          const yc = a + ((n + 1) * span) / (L.colors.length + 1) + Math.sin(x * 0.06 + t * (L.speed ?? 0.4) + n * 1.7) * span * 0.22;
          const shimmer = 0.55 + 0.45 * Math.sin(x * 0.21 - t * 1.3 + n);
          for (let dy = -3; dy <= 3; dy++) {
            const y = Math.round(yc + dy);
            const k = (1 - Math.abs(dy) / 4) * shimmer;
            if (k < 0.2 || hash(x, y, n + 53) > k) continue;
            g.put(x, y, pick(L.glyphs, hash(x, y, Math.floor(t * 2))), mix(g.bgAt(x, y), color, k));
          }
        }
      });
    },

    // { from, to, window, windowOff, height: [min, max], neon? }: a city skyline with lit windows.
    skyline(g, t, L, st) {
      if (st.w !== g.w || st.h !== g.h) {
        st.w = g.w;
        st.h = g.h;
        st.tops = new Int16Array(g.w);
        st.ids = new Int16Array(g.w);
        const [lo, hi] = L.height ?? [0.15, 0.45];
        for (let x = 0, id = 0; x < g.w; id++) {
          const width = 4 + Math.floor(hash(id, 1, 59) * 7);
          const top = g.h - Math.round((lo + hash(id, 2, 59) * (hi - lo)) * g.h);
          for (let k = 0; k < width && x < g.w; k++, x++) {
            st.tops[x] = top;
            st.ids[x] = id;
          }
        }
      }
      for (let x = 0; x < g.w; x++) {
        const id = st.ids[x];
        const body = mix(L.from, L.to, hash(id, 3, 59));
        const edge = x === 0 || st.ids[x - 1] !== id;
        for (let y = st.tops[x]; y < g.h; y++) {
          let glyph = ' ';
          let fg = body;
          if (!edge && x % 2 === 1 && (y - st.tops[x]) % 2 === 1) {
            const lit = hash(x, y, 61 + Math.floor(t / 4 + hash(x, y, 67) * 3)) < 0.45;
            glyph = '■';
            fg = lit ? L.window : L.windowOff;
          }
          g.put(x, y, glyph, fg, body);
        }
      }
    },

    // { color, step, glyph }: Conway's Game of Life, reseeded when it settles.
    life(g, t, L, st) {
      const n = g.w * g.h;
      const seed = () => {
        st.cells = new Uint8Array(n);
        st.fade = new Float32Array(n);
        for (let i = 0; i < n; i++) st.cells[i] = Math.random() < 0.22 ? 1 : 0;
        st.generation = 0;
      };
      if (!st.cells || st.cells.length !== n) {
        seed();
        st.last = t;
      }
      if (t < st.last) st.last = t; // the clock went back (a few frames sampled ahead)
      if (t - st.last > (L.step ?? 0.25)) {
        st.last = t;
        const next = new Uint8Array(n);
        let alive = 0;
        let changed = 0;
        for (let y = 0; y < g.h; y++) {
          for (let x = 0; x < g.w; x++) {
            let around = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx || dy) around += st.cells[wrap(y + dy, g.h) * g.w + wrap(x + dx, g.w)];
              }
            }
            const i = y * g.w + x;
            const live = st.cells[i] ? around === 2 || around === 3 : around === 3;
            next[i] = live ? 1 : 0;
            alive += next[i];
            if (next[i] !== st.cells[i]) changed++;
          }
        }
        st.cells = next;
        st.generation++;
        if (alive < n * 0.02 || changed < n * 0.002 || st.generation > 600) seed();
      }
      for (let i = 0; i < n; i++) {
        st.fade[i] = st.cells[i] ? 1 : st.fade[i] * 0.86;
        if (st.fade[i] < 0.08) continue;
        const x = i % g.w;
        const y = (i - x) / g.w;
        g.put(x, y, L.glyph ?? '■', mix(g.rowBg[y], L.color, st.fade[i]));
      }
    },
  };

  // Draws themes on a canvas: full window (the wallpaper) or fixed size (a thumbnail).
  class Renderer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.fontSize = opts.fontSize ?? 14;
      this.fixed = opts.columns ? { columns: opts.columns, rows: opts.rows } : null;
      this.states = new Map();
      this.veil = null;
      this.flipped = false; // set when the canvas is shown through an invert filter
      this.lane = null; // { x0, x1 } in CSS px: the conversation column, kept clear of suns and moons
      this.resize();
    }

    resize() {
      const dpr = this.fixed ? 1 : Math.min(2, globalThis.devicePixelRatio || 1);
      const ctx = this.ctx;
      ctx.font = `${this.fontSize}px ui-monospace, Menlo, Consolas, monospace`;
      this.cw = Math.ceil(ctx.measureText('M').width);
      this.chH = Math.ceil(this.fontSize * 1.3);
      let width;
      let height;
      if (this.fixed) {
        width = this.fixed.columns * this.cw;
        height = this.fixed.rows * this.chH;
      } else {
        width = globalThis.innerWidth;
        height = globalThis.innerHeight;
      }
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.width = width;
      this.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${this.fontSize}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      const columns = Math.ceil(width / this.cw);
      const rows = Math.ceil(height / this.chH);
      this.grid = new Grid(columns, rows);
      this.states.clear();
    }

    state(layer) {
      let st = this.states.get(layer);
      if (!st) this.states.set(layer, (st = {}));
      return st;
    }

    frame(theme, t) {
      const g = this.grid;
      g.reset();
      g.flipped = this.flipped;
      g.lane = this.lane ? [Math.floor(this.lane.x0 / this.cw), Math.ceil(this.lane.x1 / this.cw), Math.ceil((this.lane.left ?? 0) / this.cw)] : null;
      for (const layer of theme.layers) LAYERS[layer.type](g, t, layer, this.state(layer));
      this.draw();
    }

    draw() {
      const { ctx, grid: g, cw, chH } = this;
      for (let y = 0; y < g.h; y++) {
        ctx.fillStyle = css(g.rowBg[y]);
        ctx.fillRect(0, y * chH, this.width, chH + 1);
      }
      // Glyphs are grouped by (coarsened) colour so fillStyle changes stay few.
      const groups = new Map();
      for (let i = 0; i < g.ch.length; i++) {
        if (g.bg[i] !== NONE) {
          ctx.fillStyle = css(g.bg[i]);
          ctx.fillRect((i % g.w) * cw, Math.floor(i / g.w) * chH, cw + 0.5, chH + 0.5);
        }
        if (g.ch[i]) {
          const key = g.fg[i] & 0xf8f8f8;
          let list = groups.get(key);
          if (!list) groups.set(key, (list = []));
          list.push(i);
        }
      }
      ctx.textAlign = 'center';
      for (const [color, list] of groups) {
        ctx.fillStyle = css(color);
        for (const i of list) {
          ctx.fillText(String.fromCharCode(g.ch[i]), (i % g.w) * cw + cw / 2, Math.floor(i / g.w) * chH + chH / 2);
        }
      }
      const veil = this.veil;
      if (veil && veil.alpha > 0) {
        // With a reading lane, the veil is full only behind the text column and
        // fades to `outer` at the sides, where the scene can show itself.
        if (veil.lane && veil.lane.outer < veil.alpha) {
          const { x0, x1, feather, outer } = veil.lane;
          const w = this.width;
          const [r, gr, b] = veil.rgb;
          const at = (x) => Math.min(1, Math.max(0, x / w));
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          const o = `rgba(${r}, ${gr}, ${b}, ${outer})`, f = `rgba(${r}, ${gr}, ${b}, ${veil.alpha})`;
          grad.addColorStop(0, x0 - feather > 0 ? o : f);
          grad.addColorStop(at(x0 - feather), o);
          grad.addColorStop(at(x0), f);
          grad.addColorStop(at(x1), f);
          grad.addColorStop(at(x1 + feather), o);
          grad.addColorStop(1, x1 + feather < w ? o : f);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = veil.color;
          ctx.globalAlpha = veil.alpha;
        }
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.globalAlpha = 1;
      }
    }
  }

  CS.engine = { Grid, Renderer, LAYERS, mix, hash, css };
})();
