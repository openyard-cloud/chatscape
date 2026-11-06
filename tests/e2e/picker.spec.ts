// Opening the picker and choosing a scene, the ways a person would.
import { test, expect } from './extension';
import { picker, send } from './helpers';

test('typing /chatscape and Enter opens the picker and sends nothing', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  await expect(picker(page)).toBeVisible();
  await expect(page.locator('#sent li')).toHaveCount(0);
  await expect(page.locator('#editor')).toHaveText('');
});

test("claude.ai's own /theme command still works", async ({ open }) => {
  const page = await open('claude', 'light');
  await send(page, '#editor', '/theme dark');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(picker(page)).toHaveCount(0);
});

test('a normal message is sent as usual', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', 'Hello there');
  await expect(page.locator('#sent li')).toHaveText(['Hello there']);
  await expect(picker(page)).toHaveCount(0);
});

test('Alt+Shift+T (Option+Shift+T on a Mac) toggles the picker', async ({ open }) => {
  const page = await open('claude');
  await page.locator('#answer-text').click();
  await page.keyboard.press('Alt+Shift+KeyT');
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Alt+Shift+KeyT');
  await expect(picker(page)).toHaveCount(0);
});

test('the toolbar button and shortcut reach the page through the background script', async ({ open, worker }) => {
  const page = await open('claude');
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: 'toggle-picker' });
  });
  await expect(picker(page)).toBeVisible();
});

test('clicking a scene switches the wallpaper and marks it chosen', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  const koi = picker(page).getByRole('option', { name: 'Koi Pond' });
  await koi.click();
  await expect(koi).toHaveAttribute('aria-selected', 'true');
  await expect(picker(page).getByRole('option', { name: 'Cloud Drift' })).toHaveAttribute('aria-selected', 'false');
});

test('arrow keys preview scenes and Esc closes', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  const current = picker(page).locator('[aria-selected="true"]');
  const before = await current.textContent();
  await page.keyboard.press('ArrowRight');
  await expect(current).not.toHaveText(before!);
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
});

test('the picker shows the Mac shortcut on a Mac and the Alt one elsewhere', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform));
  await expect(picker(page)).toContainText(mac ? '⌥ Option+Shift+T' : 'Alt+Shift+T');
});

test("the picker opens above a site's modal dialog and takes clicks", async ({ open }) => {
  // ChatGPT's log-in is a <dialog> opened with showModal(): it sits in the top
  // layer, above any z-index, and makes everything else on the page inert.
  const page = await open('chatgpt', 'light');
  await page.locator('#login').click();
  await expect(page.locator('dialog.auth')).toBeVisible();
  await page.keyboard.press('Alt+Shift+KeyT');
  await expect(picker(page)).toBeVisible();

  const aurora = picker(page).getByRole('option', { name: 'Aurora' });
  await aurora.click(); // a click on an inert or covered picker would time out
  await expect(aurora).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator('dialog.auth')).toBeVisible(); // Esc closes only the picker
  await expect(page.locator('#chatscape-layer')).toHaveCount(0);
});

test("Esc closes the picker, not the site's dialog behind it", async ({ open }) => {
  const page = await open('claude');
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.keyboard.press('Alt+Shift+KeyT');
  await expect(picker(page)).toBeVisible();
  await page.locator('#mode-light').focus(); // focus back on the site, as after a click on it
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator('#settings')).toBeVisible();
  await page.keyboard.press('Escape'); // and the next Esc is the site's again
  await expect(page.locator('#settings')).toHaveCount(0);
});
