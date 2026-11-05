// First run: install the extension, open claude.ai, see the default scene.
import { test, expect } from './extension';

test('a fresh install shows Cloud Drift behind claude.ai', async ({ open }) => {
  const page = await open('claude');
  await expect(page.locator('html')).toHaveAttribute('data-chatscape', '');
  const canvas = page.locator('#chatscape-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBe(1440);
  expect(box?.height).toBe(900);
  // the page's own background is see-through, so the scene shows
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});

test('the extension also runs on chatgpt.com', async ({ open }) => {
  const page = await open('chatgpt', 'dark');
  await expect(page.locator('#chatscape-canvas')).toBeVisible();
});

test('other sites are left alone', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://example.com/');
  await page.waitForTimeout(800);
  await expect(page.locator('#chatscape-canvas')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-chatscape', '');
});

test('the scene never covers the chat or takes clicks', async ({ open }) => {
  const page = await open('claude');
  await page.locator('#editor').click();
  await expect(page.locator('#editor')).toBeFocused();
  expect(await page.evaluate(() => document.elementFromPoint(700, 300)?.id)).not.toBe('chatscape-canvas');
});
