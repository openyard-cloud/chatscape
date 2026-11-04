import { defineConfig } from '@playwright/test';

// Smoke tests on the real claude.ai with your own login (tests/live). Not run in CI.
export default defineConfig({
  testDir: './tests/live',
  testMatch: '*.live.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
