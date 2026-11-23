import { expect, test, type Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, readLocalStorage, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';
/** Same key as LOCAL_CLEANUP_PENDING_KEY in src/services/localCleanup.ts. */
const LOCAL_CLEANUP_PENDING_KEY = 'ausgegeben-local-cleanup-pending-v1';

/**
 * Cross-tab account lifecycle in a real browser, beyond the sign-out case in
 * authLifecycle.spec.ts: account deletion while another tab is open, and a direct switch
 * to a different account on a "remember me" device, where Firebase's IndexedDB
 * persistence syncs the new user into every open tab. The invariant in both: no tab ever
 * renders one account's transactions under another account's session.
 */
const PASSWORD = 'correct horse battery staple';
const ALPHA_NOTE = 'alpha-only-private-note';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

async function addExpenseWithNote(page: Page, note: string): Promise<void> {
  await page.evaluate(async (n) => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const cat = (await repo.getAllCategories()).find((c: { transactionType: string }) => c.transactionType === 'expense');
    await repo.insertExpense({ amount: 42, dateMillis: Date.now(), categoryId: cat.id, note: n, transactionType: 'expense' });
  }, note);
}

/** Records, from now on, whether ALPHA_NOTE ever appears in the page while account B is signed in. */
async function watchForLeak(page: Page, uidB: () => Promise<string>): Promise<void> {
  const b = await uidB();
  await page.evaluate(([note, bUid]) => {
    const w = window as unknown as { __leak: boolean };
    w.__leak = false;
    const check = async () => {
      const path = '/src/services/authStore.ts';
      const { useAuthStore } = await import(/* @vite-ignore */ path);
      if (useAuthStore.getState().user?.uid === bUid && document.body.innerText.includes(note)) w.__leak = true;
    };
    new MutationObserver(() => void check()).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, [ALPHA_NOTE, b] as const);
}

async function currentUid(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const path = '/src/services/authStore.ts';
    const { useAuthStore } = await import(/* @vite-ignore */ path);
    return useAuthStore.getState().user?.uid ?? null;
  });
}

async function uidForEmail(email: string): Promise<string> {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  return (await res.json()).localId as string;
}

test('deleting the account in one tab signs out another open tab, and a reload stays signed out', async ({ context }) => {
  const email = `delete-crosstab-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(email, PASSWORD);
  const tabA = await context.newPage();
  await signIn(tabA, email, PASSWORD);
  await addExpenseWithNote(tabA, ALPHA_NOTE);
  const [tabB] = await Promise.all([
    context.waitForEvent('page'),
    tabA.evaluate(() => window.open(window.location.href, '_blank')),
  ]);
  await expect(tabB.getByText(ALPHA_NOTE)).toBeVisible({ timeout: 15_000 });

  await tabA.getByRole('button', { name: en.navSettings }).click();
  await tabA.getByRole('button', { name: en.settingsDeleteAccount }).last().click();
  const dialog = tabA.getByRole('alertdialog');
  await dialog.getByLabel(en.settingsDeleteAccountPassword).fill(PASSWORD);
  await dialog.getByRole('button', { name: en.settingsDeleteAccount }).click();
  await expect(tabA.locator('#auth-email')).toBeVisible({ timeout: 20_000 });

  await expect(tabB.locator('#auth-email')).toBeVisible({ timeout: 5_000 });
  await expect(tabB.getByText(ALPHA_NOTE)).toHaveCount(0);
  await tabB.reload();
  await expect(tabB.locator('#auth-email')).toBeVisible({ timeout: 15_000 });
  await expect(tabB.locator('#app-main')).toHaveCount(0);
});

test('switching to another account on a remember-me device never shows the first account’s data in any tab', async ({ context }) => {
  const emailA = `switch-a-${test.info().workerIndex}@example.com`;
  const emailB = `switch-b-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(emailA, PASSWORD);
  await createVerifiedUser(emailB, PASSWORD);

  const tab1 = await context.newPage();
  await signIn(tab1, emailA, PASSWORD, /* rememberMe */ true);
  await addExpenseWithNote(tab1, ALPHA_NOTE);
  await expect(tab1.getByText(ALPHA_NOTE)).toBeVisible({ timeout: 15_000 });
  // An independent tab: with durable persistence it shares the IndexedDB session.
  const tab2 = await context.newPage();
  await tab2.goto('/');
  await expect(tab2.getByText(ALPHA_NOTE)).toBeVisible({ timeout: 15_000 });

  const bUid = () => uidForEmail(emailB);
  await watchForLeak(tab1, bUid);

  await tab2.getByRole('button', { name: en.navSettings }).click();
  await tab2.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  await tab2.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut }).click();
  await tab2.locator('#auth-email').waitFor({ state: 'visible', timeout: 25_000 });
  // The sign-in form must not appear before the sign-out's local wipe has finished: a
  // sign-in racing that wipe had its Firestore instance terminated and was signed out
  // again when the wipe ended. The wipe's pending marker is removed only once it is done.
  expect(await readLocalStorage(tab2, LOCAL_CLEANUP_PENDING_KEY)).toBeNull();
  await signIn(tab2, emailB, PASSWORD, /* rememberMe */ true);
  // signIn() navigates tab2, which drops its watcher: watch again from here on.
  await watchForLeak(tab2, bUid);

  const b = await bUid();
  await expect.poll(() => currentUid(tab2), { timeout: 15_000 }).toBe(b);
  // tab1 either follows to B through the shared session or stays signed out; never A's rows under B.
  await expect.poll(async () => {
    const uid = await currentUid(tab1);
    return uid === null || uid === b;
  }, { timeout: 15_000 }).toBe(true);
  await tab1.waitForTimeout(2_000);
  for (const tab of [tab1, tab2]) {
    expect(await tab.evaluate(() => (window as unknown as { __leak: boolean }).__leak)).toBe(false);
    if ((await currentUid(tab)) === b) await expect(tab.getByText(ALPHA_NOTE)).toHaveCount(0);
  }
});

test('signing out in one session-only tab leaves a different account in another tab signed in and working', async ({ context }) => {
  const emailA = `scope-a-${test.info().workerIndex}@example.com`;
  const emailB = `scope-b-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(emailA, PASSWORD);
  await createVerifiedUser(emailB, PASSWORD);
  // Independent tabs (not window.open): each keeps its own sessionStorage, so each holds
  // its own session-only sign-in.
  const tabA = await context.newPage();
  await signIn(tabA, emailA, PASSWORD);
  await addExpenseWithNote(tabA, ALPHA_NOTE);
  const tabB = await context.newPage();
  await signIn(tabB, emailB, PASSWORD);
  const b = await uidForEmail(emailB);
  await expect.poll(() => currentUid(tabB), { timeout: 15_000 }).toBe(b);

  await tabA.getByRole('button', { name: en.navSettings }).click();
  await tabA.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  await tabA.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut }).click();
  await tabA.locator('#auth-email').waitFor({ state: 'visible', timeout: 25_000 });
  expect(await readLocalStorage(tabA, LOCAL_CLEANUP_PENDING_KEY)).toBeNull();

  // Before the sign-out message named its account, B was signed out here as well and its
  // Firestore instance was terminated, losing any writes not yet on the server.
  await tabB.waitForTimeout(1_500);
  expect(await currentUid(tabB)).toBe(b);
  await expect(tabB.locator('#app-main')).toBeVisible();
  await expect(tabB.locator('#auth-email')).toHaveCount(0);
  // B's Firestore instance is still alive: a new write goes through and shows up.
  const bNote = 'bravo-after-alpha-signed-out';
  await addExpenseWithNote(tabB, bNote);
  await expect(tabB.getByText(bNote)).toBeVisible({ timeout: 15_000 });
  await expect(tabB.getByText(ALPHA_NOTE)).toHaveCount(0);
});
