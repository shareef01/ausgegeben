import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator } from './helpers';

/**
 * Preference-load recovery.
 *
 * Before this existed, a preferences snapshot that never arrived was handled by quietly
 * continuing with local defaults: a brand-new account could skip onboarding, and nobody
 * was told their settings had not loaded. The app now distinguishes loading from an
 * authoritative answer and offers a real retry / continue choice.
 *
 * The failure is produced by aborting the emulator's Firestore traffic, not by a timer
 * in the test: the listener either errors or never answers, and either way the app must
 * land on the recovery state.
 */
const PASSWORD = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

async function signInExpectingRecovery(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
}

test('an unreadable preferences document offers retry or continue, and retry recovers', async ({ page }) => {
  const email = `prefs-recovery-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(email, PASSWORD);

  // Break Firestore before the app ever subscribes to preferences.
  await page.route('**/*:8080/**', (route) => route.abort());
  await page.route('**/localhost:8080/**', (route) => route.abort());

  await signInExpectingRecovery(page, email);

  const recovery = page.getByRole('alert');
  await expect(recovery).toBeVisible({ timeout: 20_000 });
  await expect(recovery).toContainText(en.prefsLoadErrorTitle);
  await expect(recovery.getByRole('button', { name: en.actionRetry })).toBeVisible();
  await expect(recovery.getByRole('button', { name: en.prefsContinueOffline })).toBeVisible();

  // The primary action takes focus, so keyboard and screen-reader users land on it.
  await expect(recovery.getByRole('button', { name: en.actionRetry })).toBeFocused();

  // Restore connectivity and retry: the real snapshot must arrive and the app continue.
  await page.unroute('**/*:8080/**');
  await page.unroute('**/localhost:8080/**');
  await recovery.getByRole('button', { name: en.actionRetry }).click();

  const skip = page.getByRole('button', { name: en.onboardingSkip });
  const appMain = page.locator('#app-main');
  await Promise.race([
    skip.waitFor({ state: 'visible', timeout: 20_000 }),
    appMain.waitFor({ state: 'attached', timeout: 20_000 }),
  ]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('continuing on the device never re-enters onboarding for a returning account', async ({ page }) => {
  const email = `prefs-continue-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(email, PASSWORD);
  // A brand-new account (last sign-in == creation, second resolution) is sent to
  // onboarding when continuing offline. Waiting past the next second makes the UI
  // sign-in below a genuine *returning* sign-in instead of depending on timing.
  await new Promise((resolve) => setTimeout(resolve, 1_100));

  await page.route('**/*:8080/**', (route) => route.abort());
  await page.route('**/localhost:8080/**', (route) => route.abort());
  await signInExpectingRecovery(page, email);

  const recovery = page.getByRole('alert');
  await expect(recovery).toBeVisible({ timeout: 20_000 });
  await recovery.getByRole('button', { name: en.prefsContinueOffline }).click();

  // Unknown onboarding state for a returning account renders the app, never onboarding.
  await expect(page.locator('#app-main')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: en.onboardingSkip })).toHaveCount(0);
});
