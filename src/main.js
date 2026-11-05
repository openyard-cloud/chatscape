// Wires everything on a claude.ai or chatgpt.com page: saved settings,
// the wallpaper canvas and its animation loop, the scanner, the picker, and
// the ways to open it (toolbar button, Alt+Shift+T (Option on a Mac), typing /chatscape + Enter).
(() => {
  'use strict';
  const CS = (globalThis.Chatscape = globalThis.Chatscape || {});
  if (CS.started) return;
  CS.started = true;

  const DEFAULTS = { enabled: true, theme: 'cloud-drift', dim: 0.35, glass: 0.72, speed: 1, matchMode: true };
  const FRAME_MS = 1000 / 30;
  const COMMAND = '/chatscape';

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

  // Text must stay readable on every scene in both page modes. From one rendered frame
  // (sampled small), find the lightest veil, never below the user's Dim, that gives the
  // page's text 7:1 against 98% of the pixels. The same is tried with the canvas shown
  // inverted and its hues turned back (a night sky becomes a pale day sky); whichever
  // needs less veil wins, so the scene keeps as much of itself as it can. A night scene
  // on a light page (or a day scene on a dark one) leans to inverting: at about the same
  // veil, a heavy veil over the wrong sky reads as muddy gray.
  const TARGET = 7, COVER = 0.98, MAX_VEIL = 0.92;
  let probe = null;

  const linear = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  function pageColor() {
    return scanner?.pageColor ?? CS.Scanner.initialPageColor() ?? (CS.pageIsDark() ? { r: 38, g: 38, b: 36 } : { r: 250, g: 249, b: 245 });
  }

  function sceneSample() {
    probe ??= Object.assign(document.createElement('canvas'), { width: 96, height: 60 });
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    return ctx.getImageData(0, 0, probe.width, probe.height).data;
  }

  // The smallest veil alpha that makes `text` readable over `px` mixed with `veilRgb`.
  function neededVeil(px, veilRgb, text, invert) {
    const tl = lum(text.r, text.g, text.b);
    const ok = (a) => {
      let good = 0, n = 0;
      for (let i = 0; i < px.length; i += 4, n++) {
        const ch = (k) => { const s = invert ? 255 - px[i + k] : px[i + k]; return s * (1 - a) + veilRgb[k] * a; };
        const bl = lum(ch(0), ch(1), ch(2));
        if ((Math.max(bl, tl) + 0.05) / (Math.min(bl, tl) + 0.05) >= TARGET) good++;
      }
      return good / n >= COVER;
    };
    let lo = settings.dim, hi = MAX_VEIL;
    if (ok(lo)) return lo;
    if (!ok(hi)) return hi;
    for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  function fitVeil() {
    const theme = CS.themeById(settings.theme);
    const page = pageColor();
    const text = CS.parseColor(getComputedStyle(document.body).color) ?? (CS.pageIsDark() ? { r: 245, g: 244, b: 239 } : { r: 20, g: 20, b: 19 });
    renderer.veil = null;
    canvas.style.filter = '';
    const sample = (flipped) => { renderer.flipped = flipped; renderer.frame(theme, clock || 10); return sceneSample(); };
    const rgb = [page.r, page.g, page.b];
    const plain = neededVeil(sample(false), rgb, text, false);
    const inverted = neededVeil(sample(true), rgb, text, true);
    const mismatched = theme.dark !== (lum(page.r, page.g, page.b) < 0.2);
    const invert = mismatched ? inverted <= plain + 0.05 : inverted < plain - 0.05;
    // the veil is painted before the CSS filter, so an inverted canvas gets an inverted veil
    const v = invert ? rgb.map((c) => 255 - c) : rgb;
    canvas.style.filter = invert ? 'invert(1) hue-rotate(180deg)' : '';
    renderer.flipped = invert;
    renderer.veil = { color: `rgb(${v[0]}, ${v[1]}, ${v[2]})`, alpha: invert ? inverted : plain };
    canvas.dataset.veil = `${invert ? 'inverted' : 'plain'} ${plain.toFixed(2)} ${inverted.toFixed(2)}`;
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
    fitVeil();
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
    if (settings.enabled && !before.enabled) {
      matchScene();
      enable();
    } else if (!settings.enabled && before.enabled) {
      disable();
      restorePageMode();
      picker.syncMode();
    } else if (settings.enabled && (settings.theme !== before.theme || settings.matchMode !== before.matchMode)) {
      matchScene();
    }
    if (!settings.enabled) return;
    applyGlass();
    startLoop();
  }

  // Settings go to chrome.storage.sync and chrome.storage.local, stamped with the time,
  // and the newer copy wins when loading: sync can be off or failing in some browsers.
  // A tab opened before the extension was updated keeps an old copy of this script
  // that can no longer save; the picker then says to reload the tab.
  const alive = () => !!globalThis.chrome?.runtime?.id;
  const areas = () => [globalThis.chrome?.storage?.sync, globalThis.chrome?.storage?.local].filter(Boolean);

  function save(change) {
    if (!alive()) {
      picker.notice('Chatscape was updated. Reload this tab to keep your choice.');
      return;
    }
    const values = { ...change, savedAt: Date.now() };
    for (const area of areas()) {
      try {
        area.set(values, () => void chrome.runtime.lastError);
      } catch {}
    }
  }

  function load(done) {
    const list = alive() ? areas() : [];
    if (!list.length) return done({});
    // sync comes first, so it wins a tie (settings saved before there was a timestamp)
    const found = [];
    let left = list.length;
    const finish = () => {
      if (--left) return;
      done(found.filter(Boolean).reduce((a, b) => (b.savedAt > a.savedAt ? b : a), found.find(Boolean) || {}));
    };
    list.forEach((area, i) => {
      try {
        area.get({ ...DEFAULTS, savedAt: 0 }, (items) => {
          if (!chrome.runtime.lastError && items) found[i] = items;
          finish();
        });
      } catch {
        finish();
      }
    });
  }

  function update(change) {
    apply(change);
    save(change);
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

  // `/chatscape` + Enter in the chat box opens the picker instead of sending. (Not
  // `/theme`: claude.ai has its own /theme command.)
  // Only the composer's text at that moment is looked at, and only to compare it.
  addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && (e.code === 'KeyT' || e.keyCode === 84)) {
        e.preventDefault();
        picker.toggle();
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const editor = editorOf(e.target);
      if (!editor || picker.contains(editor)) return;
      const text = (editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText).replace(/[\u200b-\u200d\ufeff]/g, '').trim();
      if (text !== COMMAND) return;
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
    if (area !== 'sync' && area !== 'local') return;
    const next = {};
    for (const [key, { newValue }] of Object.entries(changes)) if (key in DEFAULTS) next[key] = newValue;
    apply(next);
  });

  // A light scene puts the page in light mode and a dark scene in dark mode, so the
  // scene is shown as it is, not darkened or turned inside out to keep text readable.
  // claude.ai keeps its mode in html[data-mode]; ChatGPT in classes on <html> that
  // switch CSS variables (--lightningcss-light/-dark, older builds: .dark/.light).
  // Nothing is saved to the site: turning Chatscape off puts back what was there.
  // If the person (or the site) changes the mode by hand, that choice wins until the
  // next scene is picked; the veil then keeps the text readable as before.
  const html = document.documentElement;
  const STYLE_KEYS = ['color-scheme', '--lightningcss-light', '--lightningcss-dark'];
  let forced = null; // { dark, own, mode, classes, style }

  function writeMode(isDark) {
    const want = isDark ? 'dark' : 'light', other = isDark ? 'light' : 'dark';
    if (html.hasAttribute('data-mode')) html.setAttribute('data-mode', want);
    if (html.classList.contains(other) || html.classList.contains(want)) {
      html.classList.remove(other);
      html.classList.add(want);
    }
    html.style.setProperty('color-scheme', want, 'important');
    html.style.setProperty('--lightningcss-light', isDark ? ' ' : 'initial', 'important');
    html.style.setProperty('--lightningcss-dark', isDark ? 'initial' : ' ', 'important');
  }

  function liftStyle() {
    for (const [key, value, priority] of forced.style) {
      if (value) html.style.setProperty(key, value, priority);
      else html.style.removeProperty(key);
    }
  }

  function setPageMode(isDark) {
    if (!forced) {
      forced = {
        own: CS.pageIsDark(),
        mode: html.getAttribute('data-mode'),
        classes: ['dark', 'light'].filter((c) => html.classList.contains(c)),
        style: STYLE_KEYS.map((k) => [k, html.style.getPropertyValue(k), html.style.getPropertyPriority(k)]),
      };
    }
    forced.dark = isDark;
    writeMode(isDark);
    modeObserver.takeRecords();
  }

  // Put back the page's own mode, as it was before the first scene was matched.
  function restorePageMode() {
    if (!forced) return;
    if (forced.mode === null) html.removeAttribute('data-mode');
    else html.setAttribute('data-mode', forced.mode);
    if (forced.classes.length || html.classList.contains('dark') || html.classList.contains('light')) {
      html.classList.remove('dark', 'light');
      html.classList.add(...forced.classes);
    }
    liftStyle();
    forced = null;
    modeObserver.takeRecords();
    restartSoon();
  }

  // The site changed its mode itself: keep its choice, drop only what we added.
  function release() {
    liftStyle();
    forced = null;
    modeObserver.takeRecords();
  }

  function matchScene() {
    if (!settings.enabled) return;
    if (!settings.matchMode) return restorePageMode();
    const before = CS.pageIsDark();
    setPageMode(!!CS.themeById(settings.theme).dark);
    if (CS.pageIsDark() !== before) restartSoon();
  }

  // Did a change on <html> come from the site switching its own mode?
  function siteChangedMode(records) {
    const want = forced.dark ? 'dark' : 'light';
    for (const r of records) {
      if (r.target !== html) continue;
      if (r.attributeName === 'data-mode' && html.getAttribute('data-mode') !== want) return true;
      if (r.attributeName !== 'class' || r.oldValue === html.className) continue;
      if (html.classList.contains(forced.dark ? 'light' : 'dark')) return true;
      // ChatGPT's mode classes have generated names: lift our override for a moment
      // and see which mode the page asks for now.
      liftStyle();
      const own = CS.pageIsDark();
      writeMode(forced.dark);
      if (own !== forced.own) return true;
    }
    return false;
  }

  // claude.ai and ChatGPT switch between light and dark without a reload. When
  // the page's mode flips, start over so the glass and the veil read the new colours.
  // (A page fades between modes, so wait for that before reading colours.)
  let dark = null, modeTimer = 0;
  function restart() {
    if (!settings.enabled) return;
    disable();
    enable();
  }
  function checkMode() {
    const now = CS.pageIsDark();
    if (dark !== null && now !== dark) restart();
    dark = now;
    picker.syncMode();
  }
  function restartSoon() {
    clearTimeout(modeTimer);
    modeTimer = setTimeout(() => {
      dark = CS.pageIsDark();
      restart();
      picker.syncMode();
    }, 350);
  }
  const soon = () => { clearTimeout(modeTimer); modeTimer = setTimeout(checkMode, 150); };
  const modeObserver = new MutationObserver((records) => {
    if (forced && siteChangedMode(records)) release();
    modeObserver.takeRecords();
    soon();
  });
  modeObserver.observe(html, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-mode', 'data-theme', 'style'] });
  modeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', soon);

  function boot(saved) {
    settings = { ...DEFAULTS, ...saved };
    if (settings.enabled) {
      matchScene();
      enable();
    }
    dark = CS.pageIsDark();
  }

  load(boot);

  CS.debug = { picker, get settings() { return settings; }, update };
})();
