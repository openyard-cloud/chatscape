// Playwright fixtures: a real Chromium with the built extension (dist/chatscape, the same
// files people install), where https://claude.ai/* and https://chatgpt.com/* are answered
// with the stand-in pages in ./pages, so the content script runs exactly as on the real sites.
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(__dirname, '../..');
// CHATSCAPE_EXTENSION points the tests at another unpacked build (an older version, a release zip)
export const EXTENSION = process.env['CHATSCAPE_EXTENSION'] ? path.resolve(process.env['CHATSCAPE_EXTENSION']) : path.join(ROOT, 'dist/chatscape');
const PAGES = path.join(__dirname, 'pages');

type Fixtures = {
  context: BrowserContext;
  worker: Worker;
  /** Opens the stand-in claude.ai (or chatgpt.com) page in light or dark mode. */
  open: (site: 'claude' | 'chatgpt', mode?: 'light' | 'dark') => Promise<Page>;
  /** Writes settings the way the picker saves them, before a page is opened. */
  settle: (settings: Record<string, unknown>) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatscape-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      viewport: { width: 1440, height: 900 },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await context.route('https://claude.ai/**', (route) => route.fulfill({ path: path.join(PAGES, 'claude.html'), contentType: 'text/html' }));
    await context.route('https://chatgpt.com/**', (route) => route.fulfill({ path: path.join(PAGES, 'chatgpt.html'), contentType: 'text/html' }));
    await context.route('https://example.com/**', (route) => route.fulfill({ body: '<!doctype html><title>Example</title><p>Not a chat site.</p>', contentType: 'text/html' }));
    await use(context);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  open: async ({ context }, use) => {
    await use(async (site, mode = 'light') => {
      const page = await context.newPage();
      const host = site === 'claude' ? 'https://claude.ai/chat/test' : 'https://chatgpt.com/';
      await page.goto(`${host}?mode=${mode}`);
      await page.locator('#chatscape-canvas').waitFor({ state: 'attached' });
      await page.waitForTimeout(600); // a few frames, and the scanner's first pass
      return page;
    });
  },
  settle: async ({ worker }, use) => {
    await use(async (settings) => {
      await worker.evaluate(async (s) => {
        const values = { ...s, savedAt: Date.now() };
        await chrome.storage.sync.set(values);
        await chrome.storage.local.set(values);
      }, settings);
    });
  },
});

export const expect = test.expect;
