// Can a person still read the chat? Every check here measures a screenshot, in both page
// modes, with a dark scene (Code Rain) and a light one (Cloud Drift).
import { test, expect } from './extension';
import { brightness, picker, textContrast, variation, worstContrast } from './helpers';

const SCENES = [
  { id: 'code-rain', name: 'Code Rain' },
  { id: 'cloud-drift', name: 'Cloud Drift' },
];

for (const mode of ['light', 'dark'] as const) {
  for (const scene of SCENES) {
    test(`${mode} page, ${scene.name}: the answer and the sidebar are easy to read`, async ({ settle, open }) => {
      await settle({ theme: scene.id });
      const page = await open('claude', mode);
      // 7:1 is WCAG AAA for body text; the stand-in page itself scores far above it
      expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
      expect(await textContrast(page.locator('#sidebar-text'))).toBeGreaterThan(7);
    });
  }
}

test('no solid band is painted around the composer', async ({ settle, open }) => {
  // claude.ai rings the area under the composer with a 32px opaque box-shadow
  await settle({ theme: 'cloud-drift' });
  const page = await open('claude', 'light');
  const footer = (await page.locator('#footer').boundingBox())!;
  const band = { x: footer.x + 40, y: footer.y - 24, width: footer.width - 80, height: 16 };
  const scene = { x: footer.x + 40, y: footer.y - 140, width: footer.width - 80, height: 16 };
  // the band right above the composer should look like the scene, not like a flat strip
  expect(await variation(page, band)).toBeGreaterThan((await variation(page, scene)) * 0.25);
  expect(await brightness(page, band)).toBeLessThan(0.97);
});

for (const site of ['claude', 'chatgpt'] as const) {
  test(`${site}: the veil is strongest behind the conversation, the scene keeps its colour beside it`, async ({ settle, open }) => {
    await settle({ theme: 'snowfall' });
    const page = await open(site, 'dark');
    const lane = (await page.locator('#chatscape-canvas').getAttribute('data-lane'))!.split(' ').map(Number);
    expect(lane).toHaveLength(2);
    // how far the canvas is from the page colour (what the veil mixes in), in a
    // text-free band, inside the lane and beside it
    const page_ = site === 'claude' ? [0x1f, 0x1e, 0x1d] : [0x21, 0x21, 0x21];
    const spread = (x0: number, x1: number) => page.evaluate(([a, b, p]) => {
      const c = document.getElementById('chatscape-canvas') as HTMLCanvasElement;
      const k = c.width / innerWidth;
      const d = c.getContext('2d')!.getImageData(Math.round(a * k), Math.round(innerHeight * 0.62 * k), Math.round((b - a) * k), 40).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - p[0]) + Math.abs(d[i + 1] - p[1]) + Math.abs(d[i + 2] - p[2]);
      return sum / (d.length / 4);
    }, [x0, x1, page_] as [number, number, number[]]);
    const inLane = await spread(lane[0] + 60, lane[1] - 60);
    const beside = await spread(lane[1] + 100, Math.min(lane[1] + 200, 1440));
    expect(beside).toBeGreaterThan(inLane * 1.6);
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} page: the composer's dock is not a flat slab, the composer itself is glass`, async ({ settle, open }) => {
    await settle({ theme: 'meteor-shower', matchMode: false });
    const page = await open('claude', mode);
    await expect(page.locator('#footer')).not.toHaveAttribute('data-chatscape-glass', /.*/);
    await expect(page.locator('#composer')).toHaveAttribute('data-chatscape-glass', '');
    // the strip under the composer, where the hint sits, shows the scene, not a flat fill
    const hint = (await page.locator('#footer .hint').boundingBox())!;
    const strip = { x: hint.x + hint.width * 0.7, y: hint.y, width: hint.width * 0.28, height: hint.height };
    const scene = { x: strip.x, y: strip.y - 260, width: strip.width, height: strip.height };
    expect(await variation(page, strip)).toBeGreaterThan((await variation(page, scene)) * 0.25);
    expect(await worstContrast(page, '#footer .hint')).toBeGreaterThan(4.5);
  });
}

// How much of an area is the stand-in's magenta marker: a message that shows through.
const magenta = (page: import('@playwright/test').Page, clip: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ clip, animations: 'disabled' }).then(async (png) => {
    const { PNG } = await import('pngjs');
    const { data } = PNG.sync.read(png);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] - data[i + 1] > 120 && data[i + 2] - data[i + 1] > 120) n++;
    return n / (data.length / 4);
  });

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} page: the docked composer leaves no band across the page, and messages do not show under it`, async ({ settle, open }) => {
    await settle({ theme: 'meteor-shower', matchMode: false });
    const page = await open('claude', mode);
    // beside the composer, where claude.ai's wings are, the scene shows: not a flat band
    const composer = (await page.locator('#composer').boundingBox())!;
    const wing = { x: composer.x - 150, y: composer.y, width: 120, height: composer.height };
    const above = { x: wing.x, y: wing.y - 300, width: wing.width, height: wing.height };
    expect(await variation(page, wing)).toBeGreaterThan((await variation(page, above)) * 0.25);
    // a message in the middle of the window is seen ...
    const scrollTo = (y: number) => page.evaluate((y) => {
      const marker = document.getElementById('marker')!;
      document.getElementById('scroll')!.scrollTop += marker.getBoundingClientRect().top - y;
    }, y);
    await scrollTo(300);
    await page.waitForTimeout(150);
    const marker = (await page.locator('#marker').boundingBox())!;
    expect(await magenta(page, { x: marker.x, y: marker.y, width: marker.width, height: marker.height })).toBeGreaterThan(0.5);
    // ... and once scrolled under the dock, it is not: not beside the hint, not around the composer
    const hint = (await page.locator('#footer .hint').boundingBox())!;
    await scrollTo(hint.y);
    await page.waitForTimeout(150);
    expect(Math.abs((await page.locator('#marker').boundingBox())!.y - hint.y), 'the marker is under the hint').toBeLessThan(2);
    // a message behind the banner over the composer is gone too
    const banner = (await page.locator('#footer .banner').boundingBox())!;
    await scrollTo(banner.y + 4);
    await page.waitForTimeout(150);
    expect(await magenta(page, { x: banner.x, y: banner.y, width: banner.width, height: banner.height })).toBeLessThan(0.002);
    await scrollTo(hint.y);
    await page.waitForTimeout(150);
    const footer = (await page.locator('#footer').boundingBox())!;
    expect(await magenta(page, { x: footer.x, y: footer.y - 10, width: footer.width, height: footer.height + 10 })).toBeLessThan(0.002);
    for (const strip of ['#footer', '#wing-left', '#wing-right']) {
      await expect(page.locator(strip)).not.toHaveAttribute('data-chatscape-glass', /.*/);
    }
    await expect(page.locator('#composer')).toHaveAttribute('data-chatscape-glass', '');
  });
}

for (const [own, scene] of [['dark', 'sakura'], ['light', 'aurora']] as const) {
  test(`code coloured for a ${own} page stays readable when the scene puts the page in the other mode`, async ({ settle, open }) => {
    await settle({ theme: scene });
    const page = await open('claude', own);
    await expect(page.locator('html')).toHaveAttribute('data-mode', own === 'dark' ? 'light' : 'dark');
    expect(await worstContrast(page, '#code')).toBeGreaterThan(4.5);
    await expect(page.locator('html')).toHaveAttribute('data-chatscape-flipped', own === 'dark' ? 'light' : 'dark');
    // turned off, the page and its code are as they were
    await page.keyboard.press('Alt+Shift+T');
    await picker(page).getByRole('button', { name: 'Turn off' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-chatscape-flipped', /.*/);
    await expect(page.locator('html')).toHaveAttribute('data-mode', own);
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} page: an open Settings dialog is solid and the page behind it is dimmed`, async ({ settle, open }) => {
    await settle({ theme: 'code-rain' });
    const page = await open('claude', mode);
    const behind = { x: 300, y: 820, width: 120, height: 40 }; // outside the dialog
    const before = await brightness(page, behind);
    await page.locator('#open-settings').click();
    await page.waitForTimeout(500);
    expect(await textContrast(page.locator('#settings-text'))).toBeGreaterThan(7);
    expect(await brightness(page, behind)).toBeLessThan(before * 0.8);
  });
}

test('switching claude.ai from light to dark recolours the glass without a reload', async ({ settle, open }) => {
  await settle({ theme: 'code-rain', matchMode: false });
  const page = await open('claude', 'light');
  await page.locator('#open-settings').click();
  await page.locator('#mode-dark').click();
  await page.locator('#close-settings').click();
  await page.waitForTimeout(800);
  expect(await textContrast(page.locator('#sidebar-text'))).toBeGreaterThan(7);
  expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
});

for (const mode of ['dark', 'light'] as const) {
  test(`chatgpt.com, ${mode}: no dark blocks, text readable`, async ({ settle, open }) => {
    await settle({ theme: 'cloud-drift' });
    const page = await open('chatgpt', mode);
    expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
    expect(await textContrast(page.locator('#sidebar-text'))).toBeGreaterThan(7);
  });
}

for (const scene of ['sakura', 'aurora'] as const) {
  test(`chatgpt.com log-in dialog stays solid (${scene})`, async ({ settle, open }) => {
    await settle({ theme: scene });
    const page = await open('chatgpt', 'dark');
    await page.locator('#login').click();
    const panel = page.locator('dialog.auth section'); // (it may go clear on the dialog's solid glass)
    await page.waitForTimeout(1000);
    for (const wait of [0, 4500]) {
      await page.waitForTimeout(wait); // and again after the scanner's next sweep
      // nothing in the dialog is taken for a page-coloured strip around the composer ...
      await expect(page.locator('dialog.auth')).not.toHaveAttribute('data-chatscape-mask', /.*/);
      await expect(panel).not.toHaveAttribute('data-chatscape-mask', /.*/);
      // ... and its surface stays (nearly) opaque, so the page does not show through
      const alpha = await page.locator('dialog.auth').evaluate((el) => {
        const c = getComputedStyle(el).backgroundColor;
        return c.startsWith('rgba') ? Number(c.match(/([\d.]+)\s*\)$/)![1]) : 1;
      });
      expect(alpha).toBeGreaterThan(0.9);
      expect(await textContrast(page.locator('#auth-text'))).toBeGreaterThan(7);
    }
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`${mode} page: a primary button in a dialog keeps its own fill`, async ({ settle, open }) => {
    await settle({ theme: mode === 'light' ? 'sakura' : 'aurora' });
    const page = await open('claude', mode);
    await page.locator('#open-settings').click();
    await page.waitForTimeout(800);
    expect(await textContrast(page.locator('#copy-link'))).toBeGreaterThan(4.5);
  });
}
