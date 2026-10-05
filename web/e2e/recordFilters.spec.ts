import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

const password = 'correct horse battery staple';
test.beforeEach(async () => { await resetAuthEmulator(); await resetFirestoreEmulator(); });

test('Records composite filters, reactive results, clear and account boundary', async ({ page }) => {
  await createVerifiedUser('records-a@example.com', password);
  await createVerifiedUser('records-b@example.com', password);
  await signIn(page, 'records-a@example.com', password);
  const names = await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const cats = (await repo.getAllCategories()).filter((c: { transactionType: string }) => c.transactionType === 'expense').slice(0, 2);
    for (let i = 0; i < cats.length; i++) await repo.insertExpense({ amount: 12.5 + i,
      dateMillis: Date.now(), categoryId: cats[i].id, note: `Coffee ${i}`, transactionType: 'expense' });
    await repo.insertExpense({ amount: 99, dateMillis: Date.now(), categoryId: cats[0].id, note: 'Tea', transactionType: 'expense' });
    return cats.map((c: { name: string }) => c.name);
  });
  await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    const original = repo.onRecordExpenses.bind(repo);
    const originalCats = repo.onCategoriesChanged.bind(repo);
    const originalDelete = repo.deleteExpense.bind(repo);
    const metrics = { calls: 0, catCalls: 0, deleteCalls: 0, active: 0, lastCallback: null as null | ((rows: unknown[], error: boolean, cached: boolean) => void) };
    (window as unknown as { recordMetrics: typeof metrics }).recordMetrics = metrics;
    repo.deleteExpense = (...args: Parameters<typeof originalDelete>) => { metrics.deleteCalls++; return originalDelete(...args); };
    repo.onCategoriesChanged = (...args: Parameters<typeof originalCats>) => { metrics.catCalls++; return originalCats(...args); };
    repo.onRecordExpenses = (...args: Parameters<typeof original>) => {
      metrics.calls++; metrics.active++; metrics.lastCallback = args[2];
      const stop = original(...args);
      return () => { metrics.active--; stop(); };
    };
  });
  const search = page.getByRole('searchbox', { name: en.recordSearchPlaceholder });
  await expect(search).toBeVisible();
  await search.fill(' COFF ');
  await search.press('Tab');
  await expect(page.getByRole('button', { name: en.recordSearchClear, exact: true })).toBeFocused();
  await search.focus();
  await expect(page.locator('.txn-row-wrap')).toHaveCount(2);
  for (const name of names) {
    const chip = page.getByRole('button', { name, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('.txn-row-wrap')).toHaveCount(2);
  await page.getByLabel(en.filterMinAmount, { exact: true }).fill('13,50');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  await page.getByLabel(en.filterMaxAmount, { exact: true }).fill('12');
  await expect(page.getByRole('alert')).toContainText(en.filterAmountError);
  await page.getByRole('button', { name: en.recordClearFilters, exact: true }).first().click();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel(en.filterMinAmount, { exact: true })).toHaveValue('');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(3);
  await page.getByLabel(en.filterSortBy, { exact: true }).selectOption('amount_desc');
  await expect(page.locator('.txn-row-wrap').first()).toContainText('Tea');
  await search.fill('coffee');
  await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    const rows = await repo.getAllExpensesCapped();
    const row = rows.items.find((e: { note: string }) => e.note === 'Coffee 0');
    await repo.updateExpense({ ...row, note: 'tea now' });
  });
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { recordMetrics: { calls: number } }).recordMetrics.calls)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { recordMetrics: { catCalls: number } }).recordMetrics.catCalls)).toBe(0);
  await page.locator('.record-filters .period-select__trigger').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.record-filters .period-select__trigger')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.record-filters .period-select__trigger').click();
  await page.getByRole('option', { name: en.recordPeriodAllTime, exact: true }).click();
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  expect(await search.inputValue()).toBe('coffee');
  await page.evaluate(() => {
    const metrics = (window as unknown as { recordMetrics: { lastCallback: unknown } }).recordMetrics;
    (window as unknown as { previousRecordCallback: unknown }).previousRecordCallback = metrics.lastCallback;
  });
  await page.locator('.record-filters .period-select__trigger').click();
  await page.getByRole('option', { name: en.recordPeriodThisMonth, exact: true }).click();
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  await page.evaluate(() => {
    const callback = (window as unknown as { previousRecordCallback: (rows: unknown[], error: boolean, cached: boolean) => void }).previousRecordCallback;
    callback([{ id: 'stale', amount: 10, dateMillis: Date.now(), categoryId: 'unknown', note: 'coffee stale', transactionType: 'expense' }], false, false);
  });
  await expect(page.getByText('coffee stale', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { recordMetrics: { active: number } }).recordMetrics.active)).toBe(1);
  await page.locator('.swipeable-row__content').first().press('Delete');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(0);
  await page.evaluate(async () => {
    const path = '/src/services/toastStore.ts';
    const { useToastStore } = await import(/* @vite-ignore */ path);
    (window as unknown as { delayedDelete: unknown }).delayedDelete = useToastStore.getState().onDismiss;
    // Keep the captured commit pending while navigation/sign-in takes longer than the toast timeout.
    useToastStore.getState().dismiss({ skipDismissCallback: true });
  });
  await page.getByRole('button', { name: en.navSettings }).click();
  await page.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut }).click();
  await page.locator('#auth-email').waitFor();
  expect(await page.evaluate(() => (window as unknown as { recordMetrics: { active: number } }).recordMetrics.active)).toBe(0);
  await page.locator('#auth-email').fill('records-b@example.com');
  await page.locator('#auth-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  const skip = page.getByRole('button', { name: en.onboardingSkip });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.getByRole('searchbox', { name: en.recordSearchPlaceholder })).toHaveValue('');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { delayedDelete: () => void }).delayedDelete());
  expect(await page.evaluate(() => (window as unknown as { recordMetrics: { deleteCalls: number } }).recordMetrics.deleteCalls)).toBe(0);
  await expect(page.getByText('Coffee 1', { exact: true })).toHaveCount(0);
});
