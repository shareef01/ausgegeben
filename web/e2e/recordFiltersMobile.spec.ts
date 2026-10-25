import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * Mobile filter disclosure: on phones the advanced filter block (type, category,
 * amount, sort) starts collapsed so the transaction list is not pushed more than
 * a screen down. These controls must stay reachable, keyboard operable, and the
 * active-filter count must remain visible while collapsed.
 */
const password = 'correct horse battery staple';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.beforeEach(async () => { await resetAuthEmulator(); await resetFirestoreEmulator(); });

test('phones start with advanced filters collapsed and keep them usable', async ({ page }) => {
  await createVerifiedUser('mobile-filters@example.com', password);
  await signIn(page, 'mobile-filters@example.com', password);

  const categoryName = await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const cats = (await repo.getAllCategories()).filter(
      (c: { transactionType: string }) => c.transactionType === 'expense',
    );
    await repo.insertExpense({
      amount: 12.5,
      dateMillis: Date.now(),
      categoryId: cats[0].id,
      note: 'Mobile filter probe',
      transactionType: 'expense',
    });
    return cats[0].name as string;
  });

  const search = page.getByRole('searchbox', { name: en.recordSearchPlaceholder });
  const showFilters = page.getByRole('button', { name: en.recordShowFilters, exact: true });
  const advanced = page.locator('#record-advanced-filters');

  // Content-first default: period + search stay visible, advanced block is out.
  await expect(showFilters).toBeVisible();
  await expect(showFilters).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toBeVisible();
  await expect(advanced).toBeHidden();

  // The disclosure is a real button, so it is keyboard operable.
  await showFilters.focus();
  await page.keyboard.press('Enter');
  const hideFilters = page.getByRole('button', { name: en.recordHideFilters, exact: true });
  await expect(hideFilters).toHaveAttribute('aria-expanded', 'true');
  await expect(advanced).toBeVisible();

  const chip = page.getByRole('button', { name: categoryName, exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);

  // Collapsing again hides the controls but keeps the active-filter count visible.
  await hideFilters.click();
  await expect(advanced).toBeHidden();
  await expect(page.locator('.record-filter-badge')).toHaveText('1');
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  await expect(page.getByRole('button', { name: en.recordClearFilters, exact: true }).first()).toBeVisible();

  // Clearing from the header resets the filter without re-opening the block.
  await page.getByRole('button', { name: en.recordClearFilters, exact: true }).first().click();
  await expect(page.locator('.record-filter-badge')).toHaveCount(0);
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
  await showFilters.click();
  await expect(page.getByRole('button', { name: categoryName, exact: true })).toHaveAttribute('aria-pressed', 'false');
});
