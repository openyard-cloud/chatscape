// Finds the page's opaque backgrounds and lets the wallpaper show through:
// large ones become transparent, smaller panels (sidebar, composer, menus)
// become frosted glass. It reads computed styles, not class names, so it
// keeps working when claude.ai changes its markup. It never reads text.
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});

  const CLEAR = 'data-chatscape-clear';
  const GLASS = 'data-chatscape-glass';
  const MIN_GLASS_AREA = 1600;
  const CLEAR_RATIO = 0.3;

  function parseColor(value) {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: +a };
  }

  class Scanner {
    constructor(skip) {
      this.skip = skip;
      this.pageColor = null;
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
      for (const el of document.querySelectorAll(`[${CLEAR}], [${GLASS}]`)) {
        el.removeAttribute(CLEAR);
        el.removeAttribute(GLASS);
        el.style.removeProperty('--chatscape-rgb');
      }
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
        const color = parseColor(getComputedStyle(el).backgroundColor);
        if (!color || color.a < 0.5) continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area >= viewport * CLEAR_RATIO) {
          // The first large surface tells us the page's own background, used
          // for the veil that keeps text readable over the wallpaper.
          if (!this.pageColor) this.pageColor = color;
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
})();
