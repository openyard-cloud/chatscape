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
  // (Read through parseColor: ChatGPT's light mode gives oklch(0.159 0 none), whose
  // digits read as rgb would say "light text".)
  CS.pageIsDark = () => {
    const color = CS.parseColor(getComputedStyle(document.body).color);
    if (!color) return false;
    return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255 > 0.55;
  };

  // Text must stay readable on every scene in both page modes. From a few rendered frames
  // (sampled small), find the lightest veil, never below the user's Dim, that gives the
  // page's text 7:1 against 98% of the pixels. The same is tried with the canvas shown
  // inverted and its hues turned back (a night sky becomes a pale day sky); whichever
  // needs less veil wins, so the scene keeps as much of itself as it can. A night scene
  // on a light page (or a day scene on a dark one) leans to inverting: at about the same
  // veil, a heavy veil over the wrong sky reads as muddy gray.
  // The veil is only that strong in the reading lane, the column the conversation sits
  // in; it fades out towards the sides, where there is little text (the sidebar has its
  // own glass), so the scene keeps its colour there.
  const TARGET = 7, COVER = 0.98, MAX_VEIL = 0.92, FEATHER = 96, SIDE = 0.35;
  const SAMPLE_W = 96, SAMPLE_H = 60;
  let probe = null;

  const linear = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  function pageColor() {
    return scanner?.pageColor ?? CS.Scanner.initialPageColor() ?? (CS.pageIsDark() ? { r: 38, g: 38, b: 36 } : { r: 250, g: 249, b: 245 });
  }

  // The conversation column, found from the chat box: its first ancestor at least 480px
  // wide (claude.ai and ChatGPT both size the box to the column). Null when the column
  // takes most of the window anyway (a narrow window), so the veil is even.
  function readingLane() {
    const editor = document.querySelector('#prompt-textarea, [contenteditable="true"], textarea');
    let box = null;
    for (let el = editor; el && el !== document.body; el = el.parentElement) {
      if (picker.contains(el)) break;
      const r = el.getBoundingClientRect();
      if (r.width >= 480) { box = r; break; }
    }
    if (!box) return null;
    const x0 = Math.max(0, box.left - 40), x1 = Math.min(innerWidth, box.right + 40);
    if (x1 - x0 > innerWidth * 0.75) return null;
    // a tall panel along the left edge (the sidebar) also hides the scene
    let left = 0;
    for (const el of document.querySelectorAll('nav, aside')) {
      const r = el.getBoundingClientRect();
      if (r.left < 8 && r.height > innerHeight * 0.6 && r.width < innerWidth * 0.4 && r.right < x0) left = Math.max(left, r.right);
    }
    return { x0, x1, left };
  }

  function sceneSample() {
    probe ??= Object.assign(document.createElement('canvas'), { width: SAMPLE_W, height: SAMPLE_H });
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    return ctx.getImageData(0, 0, probe.width, probe.height).data;
  }

  // The smallest veil alpha that makes `text` readable over the sampled frames mixed
  // with `veilRgb`, counting only sample columns c0..c1.
  function neededVeil(frames, veilRgb, text, invert, c0 = 0, c1 = SAMPLE_W - 1) {
    const tl = lum(text.r, text.g, text.b);
    const ok = (a) => {
      let good = 0, n = 0;
      for (const px of frames) {
        for (let i = 0; i < px.length; i += 4) {
          const col = (i / 4) % SAMPLE_W;
          if (col < c0 || col > c1) continue;
          n++;
          const ch = (k) => { const s = invert ? 255 - px[i + k] : px[i + k]; return s * (1 - a) + veilRgb[k] * a; };
          const bl = lum(ch(0), ch(1), ch(2));
          if ((Math.max(bl, tl) + 0.05) / (Math.min(bl, tl) + 0.05) >= TARGET) good++;
        }
      }
      return good / n >= COVER;
    };
    let lo = settings.dim, hi = MAX_VEIL;
    if (ok(lo)) return lo;
    if (!ok(hi)) return hi;
    for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  let lane = null;
  function laneFor(alpha) {
    if (!lane) return null;
    return { ...lane, feather: FEATHER, outer: Math.min(alpha, settings.dim + (alpha - settings.dim) * SIDE) };
  }

  function fitVeil() {
    const theme = CS.themeById(settings.theme);
    const page = pageColor();
    const text = CS.parseColor(getComputedStyle(document.body).color) ?? (CS.pageIsDark() ? { r: 245, g: 244, b: 239 } : { r: 20, g: 20, b: 19 });
    renderer.veil = null;
    canvas.style.filter = '';
    lane = readingLane();
    renderer.lane = lane;
    // a few moments of the scene, so a moon or a meteor drifting into the lane later is counted
    const base = clock || 10;
    const sample = (flipped) => {
      renderer.flipped = flipped;
      return [0, 7, 19].map((dt) => { renderer.frame(theme, base + dt); return sceneSample(); });
    };
    const c0 = lane ? Math.floor((lane.x0 / innerWidth) * SAMPLE_W) : 0;
    const c1 = lane ? Math.ceil((lane.x1 / innerWidth) * SAMPLE_W) : SAMPLE_W - 1;
    const rgb = [page.r, page.g, page.b];
    const plain = neededVeil(sample(false), rgb, text, false, c0, c1);
    const inverted = neededVeil(sample(true), rgb, text, true, c0, c1);
    const mismatched = theme.dark !== (lum(page.r, page.g, page.b) < 0.2);
    const invert = mismatched ? inverted <= plain + 0.05 : inverted < plain - 0.05;
    // the veil is painted before the CSS filter, so an inverted canvas gets an inverted veil
    const v = invert ? rgb.map((c) => 255 - c) : rgb;
    const alpha = invert ? inverted : plain;
    canvas.style.filter = invert ? 'invert(1) hue-rotate(180deg)' : '';
    renderer.flipped = invert;
    renderer.veil = { color: `rgb(${v[0]}, ${v[1]}, ${v[2]})`, rgb: v, alpha, lane: laneFor(alpha) };
    canvas.dataset.veil = `${invert ? 'inverted' : 'plain'} ${plain.toFixed(2)} ${inverted.toFixed(2)}`;
    canvas.dataset.lane = lane ? `${Math.round(lane.x0)} ${Math.round(lane.x1)}` : '';
  }

  // The column can move without a resize (the sidebar opens or closes): follow it.
  let laneCheck = 0;
  function followLane(now) {
    if (now - laneCheck < 1000 || !renderer?.veil) return;
    laneCheck = now;
    const next = readingLane();
    const moved = !next !== !lane || (next && (Math.abs(next.x0 - lane.x0) > 8 || Math.abs(next.x1 - lane.x1) > 8));
    if (moved) fitVeil();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    clock += ((now - (last || now)) / 1000) * settings.speed;
    last = now;
    followLane(now);
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

  // claude.ai repeats data-mode="dark|light" on inner roots (the app frame, the
  // sidebar, popovers mounted later); each of those is switched too, and remembered so
  // turning off can put its own value back. (Other data-mode values, like "cowork", are
  // not a colour mode and are left alone.)
  const INNER = '[data-mode="dark"], [data-mode="light"]';
  const innerOwn = new Map();
  function writeInner(root, want) {
    const list = root.querySelectorAll ? [...root.querySelectorAll(INNER)] : [];
    if (root.matches?.(INNER)) list.push(root);
    for (const el of list) {
      if (el === html || picker.contains(el) || el.getAttribute('data-mode') === want) continue;
      if (!innerOwn.has(el)) innerOwn.set(el, el.getAttribute('data-mode'));
      el.setAttribute('data-mode', want);
    }
  }
  function restoreInner() {
    for (const [el, value] of innerOwn) if (el.isConnected) el.setAttribute('data-mode', value);
    innerOwn.clear();
  }

  function writeMode(isDark) {
    const want = isDark ? 'dark' : 'light', other = isDark ? 'light' : 'dark';
    if (html.hasAttribute('data-mode')) html.setAttribute('data-mode', want);
    writeInner(document, want);
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
    restoreInner();
    forced = null;
    modeObserver.takeRecords();
    innerObserver.takeRecords();
    restartSoon();
  }

  // The site changed its mode itself: keep its choice, drop only what we added.
  function release() {
    liftStyle();
    innerOwn.clear();
    forced = null;
    modeObserver.takeRecords();
  }

  // Runs `fn` with the page's transitions off, then turns them back on two frames later.
  function instantly(fn) {
    html.setAttribute('data-chatscape-switching', '');
    try {
      fn();
    } finally {
      modeObserver.takeRecords();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        html.removeAttribute('data-chatscape-switching');
        modeObserver.takeRecords();
      }));
    }
  }

  function matchScene() {
    if (!settings.enabled) return;
    if (!settings.matchMode) return restorePageMode();
    // Pages fade between modes (ChatGPT's background does); with transitions off for
    // the switch, the new colours can be read at once, so the glass and the veil never
    // pair old colours with new text. They are read once more a moment later, in case
    // the page re-renders anything.
    let changed = false;
    instantly(() => {
      const before = CS.pageIsDark();
      setPageMode(!!CS.themeById(settings.theme).dark);
      changed = CS.pageIsDark() !== before;
      if (!changed) return;
      dark = !before;
      restart();
      picker.syncMode();
    });
    if (changed) restartSoon();
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
  let lastText = '';
  function checkMode() {
    // Only when the page's text colour moved (the cheap check) ...
    const text = getComputedStyle(document.body).color;
    if (text === lastText && dark !== null) return picker.syncMode();
    lastText = text;
    // ... it may be fading to its new mode: finish the fade at once, then see which
    // mode it is in and read its colours.
    instantly(() => {
      const now = CS.pageIsDark();
      if (dark !== null && now !== dark) restart();
      dark = now;
      lastText = getComputedStyle(document.body).color;
    });
    picker.syncMode();
  }
  let restartTimer = 0;
  function restartSoon() {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
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
  // Inner roots that mount later, or that the app re-renders, take the scene's mode too.
  const innerObserver = new MutationObserver((records) => {
    if (!forced) return;
    const want = forced.dark ? 'dark' : 'light';
    for (const r of records) {
      if (r.type === 'attributes') writeInner(r.target, want);
      else for (const node of r.addedNodes) if (node.nodeType === 1) writeInner(node, want);
    }
    innerObserver.takeRecords();
  });
  innerObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mode'] });

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
