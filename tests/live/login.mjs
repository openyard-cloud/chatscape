// Opens a browser window on claude.ai so you can sign in once; the session is saved to
// tests/live/.auth/claude.json (git-ignored) for `npm run test:live`. Close the window when done.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth/claude.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chromium' });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://claude.ai/login');
console.log('Sign in to claude.ai in the window, then close it.');
await page.waitForURL(/claude\.ai\/(new|chat|recents|project)/, { timeout: 10 * 60_000 });
await context.storageState({ path: out });
console.log(`Saved ${path.relative(process.cwd(), out)}`);
await browser.close();
