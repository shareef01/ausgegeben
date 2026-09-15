import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';

/** Matches `.env.emulator` and `firebase.json`'s `emulators` block. */
export const PROJECT_ID = 'demo-ausgegeben';
const API_KEY = 'fake-api-key';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';

/** Create a user directly against the Auth emulator's REST API, pre-verified so the
 * app's write paths (gated on `emailVerified`) work without an email round-trip. */
export async function createVerifiedUser(email: string, password: string): Promise<void> {
  const signUpRes = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signUpJson = await signUpRes.json();
  if (!signUpRes.ok) {
    throw new Error(`createVerifiedUser: signUp failed: ${JSON.stringify(signUpJson)}`);
  }
  const updateRes = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: signUpJson.idToken, emailVerified: true }),
    },
  );
  if (!updateRes.ok) {
    throw new Error(`createVerifiedUser: emailVerified update failed: ${await updateRes.text()}`);
  }
}

/** Wipe every emulator account between tests so email addresses can be reused. */
export async function resetAuthEmulator(): Promise<void> {
  await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

/** Wipe every emulator Firestore document between tests. */
export async function resetFirestoreEmulator(): Promise<void> {
  await fetch(
    `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}

/** Sign in through the real UI form and wait for the authenticated shell to render. */
export async function signIn(page: Page, email: string, password: string, rememberMe = false): Promise<void> {
  await page.goto('/');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  // The checkbox itself is visually hidden (a custom checkbox is rendered inside the
  // label); clicking the label is what a real user does and avoids the hidden input
  // intercepting-pointer-events failure `.check()` hits directly on it.
  if (rememberMe) await page.locator('label[for="auth-remember-me"]').click();
  await page.locator('form button[type="submit"]').click();

  // A brand-new account sees the onboarding flow once, after auth but before the app
  // shell — skip it so tests can assume `#app-main` is the sign-in completion signal.
  const appMain = page.locator('#app-main');
  const onboardingSkip = page.getByRole('button', { name: en.onboardingSkip });
  await Promise.race([
    appMain.waitFor({ state: 'attached', timeout: 15_000 }),
    onboardingSkip.waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await onboardingSkip.isVisible().catch(() => false)) {
    await onboardingSkip.click();
    await appMain.waitFor({ state: 'attached', timeout: 15_000 });
  }
}

/** Whether a Firestore SDK IndexedDB database is currently open in this page's origin. */
export async function firestoreIndexedDbExists(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('databases' in indexedDB)) return false;
    const dbs = await indexedDB.databases();
    return dbs.some((db) => (db.name ?? '').toLowerCase().includes('firestore'));
  });
}

export async function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

export const TRUSTED_DEVICE_KEY = 'ausgegeben-trusted-device-persistence';
