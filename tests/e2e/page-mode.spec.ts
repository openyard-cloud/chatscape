// The page follows the scene: a light scene puts claude.ai or ChatGPT in light mode,
// a dark scene in dark mode. Turning Chatscape off gives the page its own mode back,
// and a mode the person picks by hand wins until they pick another scene.
import { test, expect } from './extension';
import { picker, send, textContrast } from './helpers';

const html = (page: import('@playwright/test').Page) => page.locator('html');

for (const site of ['claude', 'chatgpt'] as const) {
  test(`${site}: a dark scene puts a light page in dark mode, a light scene back in light`, async ({ settle, open }) => {
    await settle({ theme: 'code-rain' });
    const page = await open(site, 'light');
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('canvas[data-veil]')).toHaveAttribute('data-veil', /^plain/);

    await page.locator('body').click();
    await page.keyboard.press('Alt+Shift+KeyT');
    await picker(page).getByRole('option', { name: 'Sakura' }).click();
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    await expect(picker(page)).toHaveClass(/^panel$/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await expect(page.locator('canvas[data-veil]')).toHaveAttribute('data-veil', /^plain/);
    expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
  });
}

// Signed in, ChatGPT keeps its mode in html[data-theme] instead.
test('chatgpt signed in: the scene sets html[data-theme], and Turn off puts it back', async ({ settle, context }) => {
  await settle({ theme: 'sakura' });
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/?mode=dark&signed=1');
  await page.locator('#chatscape-canvas').waitFor({ state: 'attached' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(html(page)).toHaveAttribute('data-appearance-preset', 'codex'); // not a mode: left alone
  await page.waitForTimeout(800);
  await expect(page.locator('canvas[data-veil]')).toHaveAttribute('data-veil', /^plain/);
  expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);

  await page.locator('body').click();
  await page.keyboard.press('Alt+Shift+KeyT');
  await picker(page).getByRole('option', { name: 'Aurora' }).click();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await picker(page).getByRole('button', { name: 'Turn off' }).click();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(html(page)).not.toHaveAttribute('data-mode', /.*/);
});

test('chatgpt signed in: a mode the site sets by hand wins', async ({ settle, context }) => {
  await settle({ theme: 'sakura' });
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/?mode=dark&signed=1');
  await page.locator('#chatscape-canvas').waitFor({ state: 'attached' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); // as Settings > Appearance does
  await page.waitForTimeout(800);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
});

test('the picker lists light scenes first, then dark ones', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  const groups = picker(page).locator('.group');
  await expect(groups).toHaveText(['Light', 'Dark']);
});

test('turning Chatscape off gives the page its own mode back', async ({ settle, open }) => {
  await settle({ theme: 'aurora' });
  const page = await open('claude', 'light');
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('button', { name: 'Turn off' }).click();
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
  await expect(html(page)).not.toHaveAttribute('style', /color-scheme/);
});

test('a mode picked by hand stays until another scene is picked', async ({ settle, open }) => {
  await settle({ theme: 'cloud-drift' });
  const page = await open('claude', 'dark');
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
  await send(page, '#editor', '/theme dark');
  await page.waitForTimeout(800);
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  expect(await textContrast(page.locator('#answer-text'))).toBeGreaterThan(7);
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('option', { name: 'Bamboo Grove' }).click();
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
});

test('with "Page follows scene" off, the page keeps its mode', async ({ settle, open }) => {
  await settle({ theme: 'code-rain', matchMode: false });
  const page = await open('claude', 'light');
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('checkbox', { name: 'Page follows scene' }).check();
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  await picker(page).getByRole('checkbox', { name: 'Page follows scene' }).uncheck();
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
});

test('switching to a dark scene never shows light glass under the new light text', async ({ settle, open }) => {
  await settle({ theme: 'sakura' });
  const page = await open('claude', 'light');
  await send(page, '#editor', '/chatscape');
  // record every frame for a second while the page goes dark
  const frames = page.evaluate(() => new Promise<{ text: number; glass: number }[]>((done) => {
    const out: { text: number; glass: number }[] = [];
    const t0 = performance.now();
    const light = (c: string) => { const [r, g, b] = c.match(/[\d.]+/g)!.map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
    const tick = () => {
      out.push({ text: light(getComputedStyle(document.body).color), glass: light(getComputedStyle(document.querySelector('nav')!).backgroundColor) });
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else done(out);
    };
    requestAnimationFrame(tick);
  }));
  await picker(page).getByRole('option', { name: 'Aurora' }).click();
  const bad = (await frames).filter((f) => f.text > 0.55 && f.glass > 0.55);
  expect(bad, 'frames with light text on light glass').toHaveLength(0);
});

test("claude.ai's inner mode roots follow the scene too, also ones mounted later", async ({ settle, open }) => {
  await settle({ theme: 'aurora' });
  const page = await open('claude', 'light');
  await expect(page.locator('nav')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'dark');
  // the app mounts its dialog from its own (light) state: it must still come up dark
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings')).toHaveAttribute('data-mode', 'dark');
  await page.locator('#close-settings').click();
  expect(await textContrast(page.locator('#sidebar-text'))).toBeGreaterThan(7);
  // turning off puts every root back
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('button', { name: 'Turn off' }).click();
  await expect(page.locator('nav')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'light');
});
