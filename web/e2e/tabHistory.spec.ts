import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * UX-4 — the active tab lives in `?tab=`, so Back/Forward, reload and a shared link all work.
 *
 * Before this, the tab was `useState` only: Back left the app instead of returning to the
 * previous tab. `tabHistory.test.ts` covers the URL merge rules; only this spec proves the real
 * history behaviour, and that the skip link still resolves its fragment.
 */

const password = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

const navTo = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('navigation', { name: en.navMain }).first().getByRole('button', { name: label });

test('tab navigation creates history entries and Back/Forward restore them', async ({ page }) => {
  await createVerifiedUser('tabs-a@example.com', password);
  await signIn(page, 'tabs-a@example.com', password);
  await expect(page).toHaveURL(/[?&]tab=record/);

  await navTo(page, en.navInsights).click();
  await expect(page).toHaveURL(/[?&]tab=insights/);
  await expect(page.getByRole('heading', { name: en.screenInsights })).toBeVisible();

  await navTo(page, en.navSettings).click();
  await expect(page).toHaveURL(/[?&]tab=settings/);

  // Re-clicking the active tab must not add a duplicate entry (Back would look like a no-op).
  const entriesBefore = await page.evaluate(() => window.history.length);
  await navTo(page, en.navSettings).click();
  expect(await page.evaluate(() => window.history.length)).toBe(entriesBefore);

  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=insights/);
  await expect(page.getByRole('heading', { name: en.screenInsights })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=record/);

  await page.goForward();
  await expect(page).toHaveURL(/[?&]tab=insights/);
});

test('a tab URL is honoured on load, invalid values fall back to record, and reload keeps the tab', async ({ page }) => {
  await createVerifiedUser('tabs-b@example.com', password);
  await signIn(page, 'tabs-b@example.com', password, false, '/?tab=settings');
  await expect(page.getByRole('heading', { name: en.screenSettings })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/[?&]tab=settings/);
  await expect(page.getByRole('heading', { name: en.screenSettings })).toBeVisible();

  await page.goto('/?tab=definitely-not-a-tab');
  await expect(page.getByRole('heading', { name: en.screenRecord })).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=record/);
});

test('unrelated query parameters and the skip link fragment survive tab navigation', async ({ page }) => {
  await createVerifiedUser('tabs-c@example.com', password);
  await signIn(page, 'tabs-c@example.com', password, false, '/?tab=record&period=2026-05');

  await navTo(page, en.navInsights).click();
  const url = new URL(page.url());
  expect(url.searchParams.get('tab')).toBe('insights');
  expect(url.searchParams.get('period')).toBe('2026-05');

  // The skip link is a fragment link to #app-main; it must still focus the main region.
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: en.actionSkipToContent });
  await skipLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app-main')).toBeFocused();
});
