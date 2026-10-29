import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * Every Record row action is reachable without a hidden gesture: the row edits, and a
 * visible "more" button opens a WAI-ARIA menu with edit, duplicate and delete. This used to
 * be a "SwipeableRow" that never swiped and, on touch, offered duplicate only via long press.
 */
const password = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

async function seedOneExpense(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const category = (await repo.getAllCategories()).find(
      (c: { transactionType: string }) => c.transactionType === 'expense',
    );
    await repo.insertExpense({
      amount: 21.5,
      dateMillis: Date.now(),
      categoryId: category.id,
      note: 'Row actions note',
      transactionType: 'expense',
    });
  });
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
}

test('row actions: keyboard reaches edit, duplicate and delete through a menu', async ({ page }) => {
  await createVerifiedUser('row-actions@example.com', password);
  await signIn(page, 'row-actions@example.com', password);
  await seedOneExpense(page);

  const row = page.locator('.action-row__content').first();
  await expect(row).toHaveAttribute('role', 'button');

  const more = page.locator('.action-row__more').first();
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('aria-haspopup', 'menu');
  await expect(more).toHaveAttribute('aria-label', new RegExp(`^${en.recordRowActionsFor.replace('{row}', '')}`));

  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText([en.editOrTap, en.recordDuplicate, en.recordSwipeDelete]);
  await expect(items.first()).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  // Duplicate through the menu adds a second row.
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: en.recordDuplicate }).click();
  await expect(page.locator('.txn-row-wrap')).toHaveCount(2);

  // Delete through the menu soft-deletes one row (with an undo toast).
  await page.locator('.action-row__more').first().click();
  await page.getByRole('menuitem', { name: en.recordSwipeDelete }).click();
  await expect(page.locator('.txn-row-wrap')).toHaveCount(1);
});

test('row actions: the more button is visible on a touch phone at 320px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await createVerifiedUser('row-actions-touch@example.com', password);
  await signIn(page, 'row-actions-touch@example.com', password);
  await seedOneExpense(page);

  const more = page.locator('.action-row__more').first();
  await expect(more).toBeVisible();
  const box = await more.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await more.tap();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(320);
  await context.close();
});
