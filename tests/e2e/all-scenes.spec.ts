// Every scene, on a light and a dark claude.ai: the conversation must stay readable.
// Screenshots land in test-results/scenes/ for a look by eye.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test, expect } from './extension';
import { textContrast, worstContrast } from './helpers';

const sandbox: { Chatscape?: { THEMES: { id: string; name: string; dark: boolean }[] } } = {};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../src/themes.js'), 'utf8'), { globalThis: sandbox });
const THEMES = sandbox.Chatscape!.THEMES;
const SHOTS = path.resolve(__dirname, '../../test-results/scenes');

test.describe.configure({ mode: 'parallel' });

for (const theme of THEMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${theme.name} on a ${mode} page`, async ({ settle, open }) => {
      await settle({ theme: theme.id, matchMode: false });
      const page = await open('claude', mode);
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${theme.id}-${mode}.png`) });
      const checks = {
        answer: await textContrast(page.locator('#answer-text')),
        table: await textContrast(page.locator('#answer table')),
        user: await textContrast(page.locator('.user')),
        sidebar: await textContrast(page.locator('#sidebar-text')),
        composer: await textContrast(page.locator('.banner')),
      };
      test.info().annotations.push({ type: 'contrast', description: JSON.stringify(Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, +v.toFixed(1)]))) });
      const veil = await page.locator('canvas[data-veil]').getAttribute('data-veil');
      test.info().annotations.push({ type: 'veil', description: veil ?? '' });
      const worst = await worstContrast(page, '#answer');
      test.info().annotations.push({ type: 'worst', description: worst.toFixed(1) });
      for (const [where, value] of Object.entries(checks)) expect(value, `${where} contrast`).toBeGreaterThan(7);
      // no spot of the answer (a moon, a sun) may drop below WCAG AA
      expect(worst, 'worst spot in the answer').toBeGreaterThan(4.5);
    });
  }
}
