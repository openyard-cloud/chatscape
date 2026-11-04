// The in-page theme picker: a panel in a shadow root with a live thumbnail
// per theme and the few settings there are. Built with DOM calls and a
// constructed stylesheet only, so the page's CSP and Trusted Types allow it.
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});

  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
      width: min(720px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 140px));
      display: flex; flex-direction: column; gap: 12px; padding: 16px;
      box-sizing: border-box; border-radius: 16px; overflow: hidden;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;
      color: #1f1e1d; background: rgba(250, 249, 245, 0.92);
      border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      z-index: 2147483647;
    }
    .panel.dark { color: #f5f4ef; background: rgba(38, 38, 36, 0.92); border-color: rgba(255, 255, 255, 0.1); }
    header { display: flex; align-items: center; gap: 8px; }
    h1 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 10px; overflow-y: auto; padding: 2px; }
    .group { grid-column: 1 / -1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.6; margin-top: 4px; }
    .card { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 4px; border-radius: 10px; padding: 4px; border: 2px solid transparent; }
    .card canvas { width: 100%; aspect-ratio: 2 / 1; border-radius: 7px; display: block; }
    .card span { font-size: 12px; padding: 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card.current { border-color: #d97757; }
    .card:focus-visible, .card.sel { outline: 2px solid #4a90d9; outline-offset: 1px; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px 20px; align-items: center; }
    label { display: flex; align-items: center; gap: 8px; }
    input[type=range] { width: 110px; accent-color: #d97757; }
    button.plain { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 8px; border: 1px solid currentColor; opacity: 0.8; }
    button.plain:hover { opacity: 1; }
    .hint { font-size: 11px; opacity: 0.6; }
    .hint.warn { opacity: 1; color: #e8590c; font-weight: 600; }
  `;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children) node.append(child);
    return node;
  }

  class Picker {
    constructor({ getSettings, onChange }) {
      this.getSettings = getSettings;
      this.onChange = onChange;
      this.host = null;
      this.isOpen = false;
      this.thumbTimer = 0;
    }

    contains(node) {
      return !!this.host && (node === this.host || this.host.contains(node));
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.build();
      document.documentElement.append(this.host);
      this.cards.find((card) => card.dataset.id === this.getSettings().theme)?.focus();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      clearInterval(this.thumbTimer);
      this.host.remove();
    }

    build() {
      const settings = this.getSettings();
      this.host = el('div', { id: 'chatscape-picker' });
      const root = this.host.attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      root.adoptedStyleSheets = [sheet];

      const isDark = CS.pageIsDark?.() ?? false;
      this.cards = [];
      const thumbs = [];
      const grid = el('div', { className: 'grid', role: 'listbox', 'aria-label': 'Themes' });
      let group = null;
      for (const theme of CS.THEMES) {
        if (theme.group !== group) {
          group = theme.group;
          grid.append(el('div', { className: 'group', text: group }));
        }
        const canvas = el('canvas');
        const card = el(
          'button',
          {
            className: 'card' + (theme.id === settings.theme ? ' current' : ''),
            role: 'option',
            'aria-selected': String(theme.id === settings.theme),
            onclick: () => this.choose(theme.id),
          },
          [canvas, el('span', { text: theme.name })],
        );
        card.dataset.id = theme.id;
        this.cards.push(card);
        thumbs.push({ theme, renderer: new CS.engine.Renderer(canvas, { columns: 48, rows: 13, fontSize: 7 }) });
        grid.append(card);
      }
      const start = performance.now();
      const paintThumbs = () => {
        const t = (performance.now() - start) / 1000 + 4;
        for (const { theme, renderer } of thumbs) renderer.frame(theme, t);
      };
      paintThumbs();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.thumbTimer = setInterval(paintThumbs, 150);

      const slider = (name, key, min, max, step) =>
        el('label', {}, [
          name,
          el('input', {
            type: 'range',
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(settings[key]),
            oninput: (e) => this.onChange({ [key]: Number(e.target.value) }),
          }),
        ]);

      const toggleButton = el('button', {
        className: 'plain',
        text: settings.enabled ? 'Turn off' : 'Turn on',
        onclick: () => {
          const enabled = !this.getSettings().enabled;
          this.onChange({ enabled });
          toggleButton.textContent = enabled ? 'Turn off' : 'Turn on';
        },
      });

      const panel = el('div', { className: 'panel' + (isDark ? ' dark' : ''), role: 'dialog', 'aria-label': 'Chatscape themes' }, [
        el('header', {}, [el('h1', { text: 'Chatscape' }), toggleButton, el('button', { className: 'plain', text: 'Close', onclick: () => this.close() })]),
        grid,
        el('div', { className: 'controls' }, [
          slider('Dim', 'dim', 0, 0.8, 0.05),
          slider('Glass', 'glass', 0.3, 1, 0.02),
          slider('Speed', 'speed', 0, 2, 0.1),
          (this.hint = el('span', { className: 'hint', text: `Arrows to move, Enter to pick, Esc to close. Open with /chatscape or ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌥ Option+Shift+T' : 'Alt+Shift+T'}.` })),
        ]),
      ]);
      panel.addEventListener('keydown', (e) => this.onKey(e));
      root.append(panel);
    }

    // Replaces the hint with a message that matters more, like a tab that needs a reload.
    notice(text) {
      if (!this.hint) return;
      this.hint.textContent = text;
      this.hint.classList.add('warn');
    }

    choose(id) {
      this.onChange({ theme: id, enabled: true });
      for (const card of this.cards) {
        const isCurrent = card.dataset.id === id;
        card.classList.toggle('current', isCurrent);
        card.setAttribute('aria-selected', String(isCurrent));
      }
    }

    onKey(e) {
      const at = this.cards.indexOf(this.host.shadowRoot.activeElement);
      const columns = Math.max(1, Math.round(this.cards[0].parentElement.clientWidth / (this.cards[0].offsetWidth + 10)));
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (move && at >= 0) {
        e.preventDefault();
        const next = this.cards[Math.max(0, Math.min(this.cards.length - 1, at + move))];
        next.focus();
        this.choose(next.dataset.id);
      }
      e.stopPropagation();
    }
  }

  CS.Picker = Picker;
})();
