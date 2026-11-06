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
  const FADE = 'data-chatscape-fade';
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

  // claude.ai docks its composer at the bottom of the conversation, in strips painted
  // with the page colour (one around the composer and its disclaimer, two "wings" out
  // to the window's sides) that hide messages scrolling under it. Frosted, those strips
  // read as a flat band across the page; cleared, the messages show through them. So
  // the strips go clear, the composer's own box becomes the glass, and the messages
  // fade out just above the composer instead (see fade()).
  // The dock is the sticky (or fixed) box at the bottom of the window that holds the
  // chat box; the card is the chat box's rounded frame inside it.
  function findDock(skip) {
    for (const editor of document.querySelectorAll('#prompt-textarea, [contenteditable="true"], textarea')) {
      if (skip(editor)) continue;
      for (let el = editor.parentElement; el && el !== document.body; el = el.parentElement) {
        const position = getComputedStyle(el).position;
        if (position !== 'sticky' && position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < innerHeight - 2 || r.height > innerHeight * 0.5) break;
        let card = editor;
        while (card !== el && !(parseFloat(getComputedStyle(card).borderTopLeftRadius) >= 8 && card.offsetWidth * card.offsetHeight >= MIN_GLASS_AREA)) card = card.parentElement;
        return { dock: el, card: card === el ? null : card };
      }
    }
    return null;
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
      this.dock = null;
      this.card = null;
      this.faded = new Set();
      this.fadeQueued = false;
      this.onMove = () => {
        if (this.fadeQueued) return;
        this.fadeQueued = true;
        requestAnimationFrame(() => {
          this.fadeQueued = false;
          this.fade();
        });
      };
      this.resized = new ResizeObserver(this.onMove);
    }

    start() {
      this.scan(document.body);
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.sweep = setInterval(() => this.scan(document.body), 4000);
      document.addEventListener('scroll', this.onMove, { capture: true, passive: true });
      addEventListener('resize', this.onMove);
    }

    stop() {
      this.observer.disconnect();
      clearInterval(this.sweep);
      clearTimeout(this.timer);
      document.removeEventListener('scroll', this.onMove, { capture: true });
      removeEventListener('resize', this.onMove);
      this.resized.disconnect();
      this.unfade();
      for (const el of document.querySelectorAll(`[${CLEAR}], [${GLASS}], [${NOSHADOW}]`)) unmark(el);
      this.dock = this.card = null;
    }

    // Finds the docked chat box again; when it is new, what was decided inside it
    // before (without knowing it was the dock) is decided again.
    watchDock() {
      const found = findDock(this.skip);
      const dock = found?.dock ?? null, card = found?.card ?? null;
      if (dock === this.dock && card === this.card) return false;
      this.resized.disconnect();
      this.unfade();
      for (const el of [this.dock, this.card, dock]) {
        if (!el?.isConnected) continue;
        unmark(el);
        for (const inner of el.querySelectorAll(`[${CLEAR}], [${GLASS}]`)) unmark(inner);
      }
      this.dock = dock;
      this.card = card;
      if (dock) this.resized.observe(dock);
      return !!dock;
    }

    // The messages fade out just above the composer, where the strips that hid them were.
    // The mask is drawn in the messages' own box, which scrolls, so it is moved on scroll.
    fade() {
      if (!this.dock?.isConnected) return;
      const top = (this.card ?? this.dock).getBoundingClientRect().top;
      for (let el = this.dock.previousElementSibling; el; el = el.previousElementSibling) {
        const r = el.getBoundingClientRect();
        if (!r.height) continue;
        el.style.setProperty('--chatscape-fade', `${Math.round(top - r.top)}px`);
        if (!this.faded.has(el)) {
          el.setAttribute(FADE, '');
          this.faded.add(el);
        }
      }
    }

    unfade() {
      for (const el of this.faded) {
        el.removeAttribute(FADE);
        el.style.removeProperty('--chatscape-fade');
      }
      this.faded.clear();
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
      const newDock = this.watchDock();
      const viewport = innerWidth * innerHeight;
      const all = [root, ...root.getElementsByTagName('*')];
      for (const el of all) {
        if (this.skip(el) || el.hasAttribute(CLEAR) || el.hasAttribute(GLASS)) continue;
        const style = getComputedStyle(el);
        if (style.boxShadow !== 'none' && solidShadow(style.boxShadow)) el.setAttribute(NOSHADOW, '');
        const color = parseColor(style.backgroundColor);
        if (el === this.card) {
          // the chat box is the glass, in its own colour or, when its frame is
          // clear and the strip around it paints it, in the strip's
          const fill = color && color.a >= 0.5 ? color : this.behind(el) ?? this.pageColor;
          if (color) this.painted.set(el, color);
          if (fill) el.style.setProperty('--chatscape-rgb', `${fill.r}, ${fill.g}, ${fill.b}`);
          el.setAttribute(GLASS, '');
          continue;
        }
        if (!color || color.a < 0.5) continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        this.painted.set(el, color);
        const dialog = el.closest(DIALOG);
        if (!dialog && this.dock?.contains(el) && !this.card?.contains(el) && near(color, this.behind(el))) {
          // a strip of the dock, painted like the page: clear, with a soft halo in
          // its colour for its loose text (the disclaimer under the composer)
          el.style.setProperty('--chatscape-rgb', `${color.r}, ${color.g}, ${color.b}`);
          el.setAttribute(CLEAR, '');
          el.setAttribute(MASK, '');
          continue;
        }
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
        } else if (style.pointerEvents === 'none' || el.parentElement?.closest(`[${GLASS}]`)) {
          // Decorative overlays (fades, scrims) and panels inside a frosted panel
          // would stack into a dark block, so they go clear instead, when they are
          // painted like what is behind them. A surface of its own colour, like the
          // dark fill of claude.ai's "Copy link" button (a pointer-events: none span
          // under white text), stays as it is.
          if (near(color, this.behind(el))) el.setAttribute(CLEAR, '');
        } else if (area >= MIN_GLASS_AREA) {
          el.style.setProperty('--chatscape-rgb', `${color.r}, ${color.g}, ${color.b}`);
          el.setAttribute(GLASS, '');
        }
      }
      if (newDock && !root.contains(this.dock)) this.scan(this.dock);
      this.fade();
    }
  }

  function unmark(el) {
    for (const name of [CLEAR, MASK, GLASS, SOLID, NOSHADOW]) el.removeAttribute(name);
    el.style.removeProperty('--chatscape-rgb');
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
