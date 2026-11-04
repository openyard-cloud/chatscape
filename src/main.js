// Wires everything on a claude.ai or chatgpt.com page: settings from chrome.storage.sync,
// the wallpaper canvas and its animation loop, the scanner, the picker, and
// the ways to open it (toolbar button, Alt+Shift+T (Option on a Mac), typing /theme + Enter).
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});
  if (CS.started) return;
  CS.started = true;

  const DEFAULTS = { enabled: true, theme: 'cloud-drift', dim: 0.35, glass: 0.72, speed: 1 };
  const FRAME_MS = 1000 / 30;
  const storage = globalThis.chrome?.storage?.sync;

  let settings = { ...DEFAULTS };
  let renderer = null;
  let canvas = null;
  let scanner = null;
  let raf = 0;
  let last = 0;
  let clock = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const isOurs = (node) => node === canvas || !!picker?.contains(node);

  // The page's own mode, read from its text colour: light text = dark page.
  CS.pageIsDark = () => {
    const color = getComputedStyle(document.body).color.match(/\d+/g);
    if (!color) return false;
    const [r, g, b] = color.map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  };

  function veil() {
    const c = scanner?.pageColor ?? CS.Scanner.initialPageColor() ?? (CS.pageIsDark() ? { r: 38, g: 38, b: 36 } : { r: 250, g: 249, b: 245 });
    return { color: `rgb(${c.r}, ${c.g}, ${c.b})`, alpha: settings.dim };
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    clock += ((now - (last || now)) / 1000) * settings.speed;
    last = now;
    renderer.frame(CS.themeById(settings.theme), clock);
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!settings.enabled || !renderer) return;
    renderer.veil = veil();
    if (reduceMotion.matches || document.hidden || settings.speed === 0) {
      renderer.frame(CS.themeById(settings.theme), clock || 10);
      return;
    }
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function enable() {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'chatscape-canvas';
      canvas.setAttribute('aria-hidden', 'true');
    }
    if (!canvas.isConnected) document.documentElement.prepend(canvas);
    const pageColor = CS.Scanner.initialPageColor();
    if (!scanner) {
      scanner = new CS.Scanner(isOurs);
      scanner.pageColor = pageColor;
      scanner.start();
    }
    document.documentElement.setAttribute('data-chatscape', '');
    applyGlass();
    if (!renderer) renderer = new CS.engine.Renderer(canvas);
    startLoop();
  }

  function disable() {
    cancelAnimationFrame(raf);
    raf = 0;
    document.documentElement.removeAttribute('data-chatscape');
    scanner?.stop();
    scanner = null;
  }

  function applyGlass() {
    const root = document.documentElement.style;
    root.setProperty('--chatscape-glass', String(settings.glass));
    root.setProperty('--chatscape-blur', settings.glass >= 0.97 ? '0px' : '12px');
  }

  function apply(next) {
    const before = settings;
    settings = { ...settings, ...next };
    if (settings.enabled && !before.enabled) enable();
    else if (!settings.enabled && before.enabled) disable();
    if (!settings.enabled) return;
    applyGlass();
    startLoop();
  }

  function update(change) {
    apply(change);
    storage?.set(change);
  }

  const picker = new CS.Picker({ getSettings: () => settings, onChange: update });

  function editorOf(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.tagName === 'TEXTAREA') return node;
    return node.closest('[contenteditable="true"], [contenteditable=""]');
  }

  function clearEditor(editor) {
    if (editor.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, '');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete', false);
  }

  // `/theme` + Enter in the chat box opens the picker instead of sending.
  // Only the composer's text at that moment is looked at, and only to compare it.
  addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        picker.toggle();
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const editor = editorOf(e.target);
      if (!editor || picker.contains(editor)) return;
      const text = (editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText).trim();
      if (text !== '/theme') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearEditor(editor);
      picker.open();
    },
    true,
  );

  addEventListener('resize', () => {
    if (!renderer) return;
    renderer.resize();
    startLoop();
  });
  document.addEventListener('visibilitychange', startLoop);
  reduceMotion.addEventListener?.('change', startLoop);

  globalThis.chrome?.runtime?.onMessage?.addListener((message) => {
    if (message?.type === 'toggle-picker') picker.toggle();
  });

  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = {};
    for (const [key, { newValue }] of Object.entries(changes)) if (key in DEFAULTS) next[key] = newValue;
    apply(next);
  });

  function boot(saved) {
    settings = { ...DEFAULTS, ...saved };
    if (settings.enabled) enable();
  }

  if (storage) storage.get(DEFAULTS, boot);
  else boot({});

  CS.debug = { picker, get settings() { return settings; }, update };
})();
