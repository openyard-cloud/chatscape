// Finds the page's opaque backgrounds and lets the wallpaper show through:
// large ones become transparent, smaller panels (sidebar, composer, menus)
// become frosted glass. It reads computed styles, not class names, so it
// keeps working when claude.ai or ChatGPT change their markup. It never reads text.
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});

  const CLEAR = 'data-chatscape-clear';
  const GLASS = 'data-chatscape-glass';
  const SOLID = 'data-chatscape-solid';
  const NOSHADOW = 'data-chatscape-noshadow';
  const MASK = 'data-chatscape-mask';
  const DIALOG = '[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]';
  const MIN_GLASS_AREA = 1600;
  const CLEAR_RATIO = 0.3;

  // Computed colours come back as rgb() for most pages, but newer CSS (color-mix,
  // oklch, lab) comes back as color(srgb ...) or oklch(...). Those are painted on a
  // 1x1 canvas once and read back as sRGB, then cached.
  const cache = new Map();
  let probe = null;
  function parseColor(value) {
    if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return null;
    const m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (m) {
      const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
      return { r: +r, g: +g, b: +b, a: a.endsWith('%') ? parseFloat(a) / 100 : +a };
    }
    if (cache.has(value)) return cache.get(value);
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    probe.canvas.width = probe.canvas.height = 1;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = 'rgba(0, 0, 0, 0)';
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    const color = a ? { r, g, b, a: a / 255 } : null;
    cache.set(value, color);
    return color;
  }

  // Pages also paint surfaces with shadows: claude.ai rings its composer area with
  // `0 0 0 32px white` to hide messages scrolling under it. A sharp (no blur), opaque
  // and wide shadow is a surface, not a shadow, so it goes too. Thin rings stay.
  function solidShadow(value) {
    for (const part of value.split(/,(?![^(]*\))/)) {
      if (part.includes('inset')) continue;
      const m = /^\s*((?:rgba?|color|oklch|oklab|lab|lch|hsla?)\([^)]*\)|#\w+|[a-z]+)\s+(.*)$/.exec(part);
      if (!m) continue;
      const c = parseColor(m[1]);
      const [x = 0, y = 0, blur = 0, spread = 0] = m[2].match(/-?[\d.]+/g)?.map(Number) || [];
      if (c && c.a >= 0.9 && blur === 0 && Math.max(Math.abs(x), Math.abs(y), spread) >= 8) return true;
    }
    return false;
  }

  const near = (a, b) => !!a && !!b && Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) <= 12;

  // claude.ai docks its composer in a square strip painted with the page colour, to
  // hide messages scrolling under it. Made frosted, that strip reads as a flat gray
  // slab around the rounded composer. An element painted the colour of what is behind
  // it, that mostly holds a surface of another colour, is such a strip: it goes clear and the surface inside
  // becomes the glass.
  function isMask(el, color, behind, area) {
    if (!near(color, behind)) return false;
    const inner = el.getElementsByTagName('*');
    for (let i = 0; i < inner.length && i < 400; i++) {
      const c = parseColor(getComputedStyle(inner[i]).backgroundColor);
      if (!c || c.a < 0.5 || near(c, color)) continue;
      const r = inner[i].getBoundingClientRect();
      if (r.width * r.height >= area * 0.3) return true;
    }
    return false;
  }

  class Scanner {
    constructor(skip) {
      this.skip = skip;
      this.pageColor = null;
      this.painted = new WeakMap(); // the colour each changed element had, since ours now hides it
      this.observer = new MutationObserver((list) => this.queue(list));
      this.pending = new Set();
      this.timer = 0;
      this.sweep = 0;
    }

    start() {
      this.scan(document.body);
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.sweep = setInterval(() => this.scan(document.body), 4000);
    }

    stop() {
      this.observer.disconnect();
      clearInterval(this.sweep);
      clearTimeout(this.timer);
      for (const el of document.querySelectorAll(`[${CLEAR}], [${GLASS}], [${NOSHADOW}]`)) {
        el.removeAttribute(CLEAR);
        el.removeAttribute(MASK);
        el.removeAttribute(GLASS);
        el.removeAttribute(SOLID);
        el.removeAttribute(NOSHADOW);
        el.style.removeProperty('--chatscape-rgb');
      }
    }

    // The colour painted behind an element: its nearest ancestor with a background.
    behind(el) {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const c = this.painted.get(p) ?? parseColor(getComputedStyle(p).backgroundColor);
        if (c && c.a >= 0.5) return c;
      }
      return this.pageColor;
    }

    queue(list) {
      for (const m of list) for (const node of m.addedNodes) if (node.nodeType === 1) this.pending.add(node);
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = 0;
        const nodes = [...this.pending];
        this.pending.clear();
        for (const node of nodes) if (node.isConnected) this.scan(node);
      }, 250);
    }

    scan(root) {
      if (!root) return;
      const viewport = innerWidth * innerHeight;
      const all = [root, ...root.getElementsByTagName('*')];
      for (const el of all) {
        if (this.skip(el) || el.hasAttribute(CLEAR) || el.hasAttribute(GLASS)) continue;
        const style = getComputedStyle(el);
        if (style.boxShadow !== 'none' && solidShadow(style.boxShadow)) el.setAttribute(NOSHADOW, '');
        const color = parseColor(style.backgroundColor);
        if (!color || color.a < 0.5) continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        this.painted.set(el, color);
        const dialog = el.closest(DIALOG);
        // A modal's own surface stays a near-solid panel however large it is,
        // so the page behind it does not show through and mix with its text.
        if (dialog && !el.parentElement?.closest(`[${GLASS}]`) && area >= MIN_GLASS_AREA) {
          el.style.setProperty('--chatscape-rgb', `${color.r}, ${color.g}, ${color.b}`);
          el.setAttribute(GLASS, '');
          el.setAttribute(SOLID, '');
          continue;
        }
        // A large see-through layer is a backdrop dimming the page under a modal: keep it.
        if (area >= viewport * CLEAR_RATIO && color.a < 0.95) continue;
        if (area >= viewport * CLEAR_RATIO) {
          // The first large surface tells us the page's own background, used
          // for the veil that keeps text readable over the wallpaper.
          if (!this.pageColor) this.pageColor = color;
          el.setAttribute(CLEAR, '');
        } else if (isMask(el, color, this.behind(el), area)) {
          // its loose text (a disclaimer under the composer) gets a soft halo in the
          // strip's colour, since the strip no longer sits behind it
          el.style.setProperty('--chatscape-rgb', `${color.r}, ${color.g}, ${color.b}`);
          el.setAttribute(CLEAR, '');
          el.setAttribute(MASK, '');
        } else if (style.pointerEvents === 'none' || el.parentElement?.closest(`[${GLASS}]`)) {
          // Decorative overlays (fades, scrims) and panels inside a frosted panel
          // would stack into a dark block, so they go clear instead.
          el.setAttribute(CLEAR, '');
        } else if (area >= MIN_GLASS_AREA) {
          el.style.setProperty('--chatscape-rgb', `${color.r}, ${color.g}, ${color.b}`);
          el.setAttribute(GLASS, '');
        }
      }
    }
  }

  // The page colour before any change: html or body, whichever is opaque.
  Scanner.initialPageColor = () => {
    for (const el of [document.body, document.documentElement]) {
      const color = parseColor(getComputedStyle(el).backgroundColor);
      if (color && color.a >= 0.5) return color;
    }
    return null;
  };

  CS.Scanner = Scanner;
  CS.parseColor = parseColor;
})();
