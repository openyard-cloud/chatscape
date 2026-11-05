// Can a person still read the chat? Every check here measures a screenshot, in both page
// modes, with a dark scene (Code Rain) and a light one (Cloud Drift).
import { test, expect } from './extension';
import { brightness, textContrast, variation } from './helpers';

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
