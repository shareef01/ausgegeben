import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

const email = 'editor-polish@example.com';
const password = 'synthetic test password';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
  await createVerifiedUser(email, password);
});

test('category search and management preserve the transaction draft and restore focus', async ({ page }) => {
  await signIn(page, email, password);
  await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    for (let index = 0; index < 8; index++) {
      await repo.insertCategory({
        name: `Synthetic category ${index}`,
        transactionType: 'expense',
        iconName: 'category',
        colorInt: 0xff7eb0e8 | 0,
        sortOrder: 100 + index,
      });
    }
  });

  const launcher = page.locator('.fab-add:visible');
  await launcher.click();
  const dialog = page.getByRole('dialog', { name: en.addTransaction });
  const search = dialog.getByRole('searchbox', { name: en.addSearchCategories });
  const amount = dialog.getByRole('textbox', { name: en.addAmountLabel });
  await expect(amount).toBeFocused();
  await amount.fill('14.50');
  await search.fill('does not exist');
  await expect(dialog.getByRole('status')).toHaveText(en.addNoMatchingCategories);
  await search.fill('SYNTHETIC CATEGORY 7');
  const category = dialog.getByRole('button', { name: 'Synthetic category 7' });
  await expect(dialog.getByRole('group', { name: en.addCategoryLabel }).getByRole('button')).toHaveCount(1);
  await search.press('Enter');
  await expect(amount).toHaveValue('14.50');
  await category.click();

  const manage = dialog.getByRole('button', { name: en.settingsCategories });
  await manage.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#categories-title')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manage).toBeFocused();
  await expect(amount).toHaveValue('14.50');
  await expect(category).toHaveAttribute('aria-pressed', 'true');

  await search.focus();
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: en.actionCancel }).click();
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await confirm.getByRole('button', { name: en.addDiscard }).click();
  await expect(launcher).toBeFocused();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('.fab-add:visible').click();
  await dialog.getByRole('button', { name: en.settingsCategories }).click();
  const manager = page.getByRole('dialog', { name: en.settingsCategories });
  await expect(manager).toBeVisible();
  await expect(manager.locator('.category-manage-list')).toBeVisible();
  const header = manager.locator('.category-manager__header');
  for (const textScale of [100, 125]) {
    await page.addStyleTag({ content: `html { font-size: ${textScale}%; }` });
    for (const region of [manager, header]) {
      const overflow = await region.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow, `Horizontal overflow in ${region} at ${textScale}% text size`).toBeLessThanOrEqual(1);
    }
  }
});

test('the budget reports actual overspend and a single income category uses a text total', async ({ page }) => {
  await signIn(page, email, password);
  await page.evaluate(async () => {
    const repoPath = '/src/repositories/expenseRepository.ts';
    const preferencesPath = '/src/services/preferencesStore.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ repoPath);
    const { usePreferencesStore } = await import(/* @vite-ignore */ preferencesPath);
    await repo.ensureSeeded();
    const categories = await repo.getAllCategories();
    for (const [type, amount] of [['expense', 125], ['income', 200]] as const) {
      const category = categories.find((item: { transactionType: string }) => item.transactionType === type);
      await repo.insertExpense({
        categoryId: category.id,
        dateMillis: Date.now(),
        amount,
        note: `Budget probe ${type}`,
        transactionType: type,
      });
    }
    usePreferencesStore.getState().setMonthlyBudget(100);
  });

  const budget = page.locator('.budget-bar');
  await expect(budget).toContainText('125% used');
  await expect(budget).toContainText('over budget');
  await expect(budget.locator('.budget-bar__fill')).toHaveCSS('width', await budget.locator('.budget-bar__track').evaluate((el) => getComputedStyle(el).width));
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  const income = page.locator('.insights-category-card').filter({ has: page.getByRole('heading', { name: en.filterIncome, exact: true }) });
  await expect(income.locator('.insights-category-card__total')).toContainText('200');
  await expect(income.locator('.insights-category-card__bar')).toHaveCount(0);
  await expect(income.getByRole('listitem')).toHaveCount(1);

  await page.locator('.fab-add:visible').click();
  const editor = page.getByRole('dialog', { name: en.addTransaction });
  await editor.getByRole('button', { name: 'Groceries', exact: true }).click();
  await editor.getByLabel(en.noteLabel).fill('Saved with Enter');
  const amount = editor.getByRole('textbox', { name: en.addAmountLabel });
  await amount.fill('15.50');
  await amount.press('Enter');
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: en.navRecord, exact: true }).click();
  await expect(page.getByText('Saved with Enter', { exact: true })).toBeVisible();
});
