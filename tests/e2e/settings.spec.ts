// What a person picks must still be there after a reload, and "Turn off" must restore the page.
import { test, expect } from './extension';
import { picker, send } from './helpers';

test('the chosen scene survives a reload', async ({ open }) => {
  const page = await open('claude');
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('option', { name: 'Koi Pond' }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('#chatscape-canvas').waitFor({ state: 'attached' });
  await send(page, '#editor', '/chatscape');
  await expect(picker(page).getByRole('option', { name: 'Koi Pond' })).toHaveAttribute('aria-selected', 'true');
});

test('the choice is shared with other tabs', async ({ open }) => {
  const first = await open('claude');
  await send(first, '#editor', '/chatscape');
  await picker(first).getByRole('option', { name: 'Aurora' }).click();
  const second = await open('chatgpt', 'dark');
  await send(second, '#prompt-textarea', '/chatscape');
  await expect(picker(second).getByRole('option', { name: 'Aurora' })).toHaveAttribute('aria-selected', 'true');
});

test('Turn off restores the page, and stays off after a reload', async ({ open }) => {
  const page = await open('claude');
  const bodyBefore = 'rgb(255, 255, 255)';
  await send(page, '#editor', '/chatscape');
  await picker(page).getByRole('button', { name: 'Turn off' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-chatscape', '');
  // (the page fades back to its own background)
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bodyBefore);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('html')).not.toHaveAttribute('data-chatscape', '');
  await expect(page.locator('#chatscape-canvas')).toBeHidden();
});

test('settings saved by an older version are kept', async ({ settle, open }) => {
  await settle({ theme: 'meteor-shower', savedAt: 0 });
  const page = await open('claude', 'dark');
  await send(page, '#editor', '/chatscape');
  await expect(picker(page).getByRole('option', { name: 'Meteor Shower' })).toHaveAttribute('aria-selected', 'true');
});
