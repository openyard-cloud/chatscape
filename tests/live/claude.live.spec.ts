// Smoke test on the real claude.ai, signed in as you (run `npm run test:live:login` once).
// Read-only: it never sends a message and never changes claude.ai settings. It checks
// whatever mode your account is in, so run it once in light and once in dark.
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { textContrast } from '../e2e/helpers';

const ROOT = path.resolve(__dirname, '../..');
const EXTENSION = process.env['CHATSCAPE_EXTENSION'] ? path.resolve(process.env['CHATSCAPE_EXTENSION']) : path.join(ROOT, 'dist/chatscape');
const AUTH = path.join(__dirname, '.auth/claude.json');

const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use) => {
    test.skip(!fs.existsSync(AUTH), 'No saved claude.ai login: run `npm run test:live:login` first.');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscape-live-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      viewport: { width: 1440, height: 900 },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await context.addCookies(JSON.parse(fs.readFileSync(AUTH, 'utf8')).cookies);
    await use(context);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto('https://claude.ai/new');
    await page.locator('#chatscape-canvas').waitFor({ state: 'attached', timeout: 20_000 });
    await page.waitForTimeout(1500);
    await use(page);
  },
});

test('the wallpaper shows behind claude.ai and the page stays readable', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-chatscape', '');
  const nav = page.locator('nav a, nav button').filter({ hasText: /\w{4,}/ }).first();
  expect(await textContrast(nav)).toBeGreaterThan(4.5);
  await page.screenshot({ path: `test-results/live-claude-${await page.evaluate(() => document.documentElement.dataset.mode || 'mode')}.png` });
});

test('no wide solid shadow is left painting over the wallpaper', async ({ page }) => {
  const painted = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => {
    const s = getComputedStyle(el).boxShadow;
    return s !== 'none' && /\b(?:[89]|\d{2,})px\)?\s*(?:,|$)/.test(s.replace(/rgba?\([^)]*\)|color\([^)]*\)/g, '')) && !/inset/.test(s);
  }).length);
  expect(painted).toBe(0);
});

test('Alt+Shift+T opens and closes the picker', async ({ page }) => {
  const panel = page.locator('#chatscape-picker [role="dialog"]');
  await page.keyboard.press('Alt+Shift+KeyT');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
