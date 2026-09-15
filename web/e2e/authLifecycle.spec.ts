import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import {
  createVerifiedUser,
  firestoreIndexedDbExists,
  readLocalStorage,
  resetAuthEmulator,
  resetFirestoreEmulator,
  signIn,
  TRUSTED_DEVICE_KEY,
} from './helpers';

const PASSWORD = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

/** Opens the Settings tab from the authenticated app shell. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: en.navSettings }).click();
  await expect(page.getByRole('checkbox', { name: en.settingsTrustedDevice })).toBeVisible();
}

async function signOut(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut }).click();
  await page.locator('#auth-email').waitFor({ state: 'attached', timeout: 15_000 });
}

test.describe('session-only auth persistence', () => {
  test('a plain reload keeps a session-only sign-in, but a fresh browser context does not', async ({ page, context }) => {
    const email = `session-${test.info().workerIndex}@example.com`;
    await createVerifiedUser(email, PASSWORD);
    await signIn(page, email, PASSWORD, /* rememberMe */ false);

    await page.reload();
    await expect(page.locator('#app-main')).toBeVisible({ timeout: 15_000 });

    // A brand new context has no sessionStorage carried over — this is what a real
    // browser restart looks like for session-only persistence.
    const freshContext = await context.browser()!.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    await expect(freshPage.locator('#auth-email')).toBeVisible({ timeout: 15_000 });
    await freshContext.close();
  });

  test('an explicit "remember me" sign-in survives a fresh browser context', async ({ page, context }) => {
    const email = `remember-${test.info().workerIndex}@example.com`;
    await createVerifiedUser(email, PASSWORD);
    await signIn(page, email, PASSWORD, /* rememberMe */ true);

    const storageState = await context.storageState({ indexedDB: true });
    const freshContext = await context.browser()!.newContext({ storageState });
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    await expect(freshPage.locator('#app-main')).toBeVisible({ timeout: 15_000 });
    await freshContext.close();
  });
});

// AUTH-1: a device-wide "trusted device" flag silently opted the *next* account on a
// shared browser into durable, on-disk Firestore caching, and survived sign-out.
test.describe('AUTH-1: trusted-device persistence does not leak across accounts', () => {
  test('full lifecycle: opt-in, sign-out reset, and the next account starting memory-only', async ({ page, context }) => {
    const userA = `trusted-a-${test.info().workerIndex}@example.com`;
    const userB = `trusted-b-${test.info().workerIndex}@example.com`;
    await createVerifiedUser(userA, PASSWORD);
    await createVerifiedUser(userB, PASSWORD);

    // 1-2: User A signs in and enables persistent storage.
    await signIn(page, userA, PASSWORD);
    await openSettings(page);
    await page.getByRole('checkbox', { name: en.settingsTrustedDevice }).click();
    // The app reloads itself after this toggle to re-initialize Firestore with the new cache.
    await page.locator('#app-main').waitFor({ state: 'attached', timeout: 15_000 });

    // 3: IndexedDB now holds a persistent Firestore cache for User A.
    expect(await readLocalStorage(page, TRUSTED_DEVICE_KEY)).toBe('true');
    expect(await firestoreIndexedDbExists(page)).toBe(true);

    // 4: User A signs out.
    await openSettings(page);
    await signOut(page);

    // 5-6: Financial Firestore cache is cleared, and the trusted-device preference itself
    // is removed — not just left at "true" for whoever signs in next. The UI's sign-out
    // confirmation fires clearLocalFirestoreCache() without awaiting it (SettingsView
    // shows the signed-out screen immediately for a snappy sign-out), so the actual
    // IndexedDB deletion — which includes a deliberate ~250ms cross-tab-release delay —
    // can still be finishing a moment after `#auth-email` appears. Poll rather than
    // assert instantaneously; what AUTH-1 actually requires is that this completes
    // before anyone signs in again, which the next block verifies.
    await expect.poll(() => firestoreIndexedDbExists(page), { timeout: 5_000 }).toBe(false);
    expect(await readLocalStorage(page, TRUSTED_DEVICE_KEY)).toBeNull();

    // 7: User B signs in without ever touching the toggle.
    await signIn(page, userB, PASSWORD);

    // 8: Firestore is memory-only for User B — the flag did not carry over.
    expect(await readLocalStorage(page, TRUSTED_DEVICE_KEY)).toBeNull();
    expect(await firestoreIndexedDbExists(page)).toBe(false);
    await openSettings(page);
    await expect(page.getByRole('checkbox', { name: en.settingsTrustedDevice })).not.toBeChecked();

    // 9-10: Close and reopen the browser (a fresh context) — User B's data was never
    // written to durable storage in the first place, so there is nothing to find.
    const storageState = await context.storageState({ indexedDB: true });
    const freshContext = await context.browser()!.newContext({ storageState });
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    expect(await firestoreIndexedDbExists(freshPage)).toBe(false);
    await freshContext.close();
  });

  test('an explicit opt-in by the second account still works', async ({ page }) => {
    const userB = `trusted-optin-${test.info().workerIndex}@example.com`;
    await createVerifiedUser(userB, PASSWORD);
    await signIn(page, userB, PASSWORD);

    await openSettings(page);
    await page.getByRole('checkbox', { name: en.settingsTrustedDevice }).click();
    await page.locator('#app-main').waitFor({ state: 'attached', timeout: 15_000 });

    expect(await readLocalStorage(page, TRUSTED_DEVICE_KEY)).toBe('true');
    expect(await firestoreIndexedDbExists(page)).toBe(true);
  });
});

// AUTH-2: session-only persistence has no built-in cross-tab signal, so a tab that did
// not itself sign out kept rendering as authenticated indefinitely.
test.describe('AUTH-2: cross-tab logout propagation', () => {
  test('signing out in one tab invalidates another open tab sharing the same session', async ({ context }) => {
    const email = `crosstab-${test.info().workerIndex}@example.com`;
    await createVerifiedUser(email, PASSWORD);

    const tabA = await context.newPage();
    await signIn(tabA, email, PASSWORD, /* rememberMe */ false);

    // sessionStorage is per top-level browsing context and is NOT shared by a page
    // independently opened in the same BrowserContext (e.g. context.newPage()) — only
    // by a genuine child window (window.open()/target="_blank" from the signed-in page
    // itself). That is the realistic precondition here: a duplicated tab, or a link
    // opened in a new tab from the already-signed-in one.
    const [tabB] = await Promise.all([
      context.waitForEvent('page'),
      tabA.evaluate(() => window.open(window.location.href, '_blank')),
    ]);
    await expect(tabB.locator('#app-main')).toBeVisible({ timeout: 15_000 });

    await openSettings(tabA);
    await signOut(tabA);

    // Tab B never triggered sign-out itself, and is never reloaded here — it must react
    // to the broadcast on its own within a bounded time.
    await expect(tabB.locator('#auth-email')).toBeVisible({ timeout: 5_000 });
    await expect(tabB.locator('#app-main')).toHaveCount(0);
  });
});
