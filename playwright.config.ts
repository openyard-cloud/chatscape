import { defineConfig } from '@playwright/test';

// Browser tests with the real extension in Chromium against stand-in claude.ai and
// chatgpt.com pages (tests/e2e). For the live site see playwright.live.config.ts.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // each test runs its own Chromium with the extension; more than two at once gets flaky
  workers: 2,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
