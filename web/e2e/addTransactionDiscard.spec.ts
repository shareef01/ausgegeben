import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * Data-safety regression: an *edited* transaction must not be discarded without
 * confirmation. The guard used to run only when `!isEditing`, because dirty state was
 * "any field is filled in" — always true for a loaded edit. A backdrop tap or Escape
 * therefore threw the user's changes away silently. Dirty state is now compared with
 * the values the form opened with.
 */
const password = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

test('editing a transaction requires confirmation before discarding changes', async ({ page }) => {
  await createVerifiedUser('discard-edit@example.com', password);
  await signIn(page, 'discard-edit@example.com', password);

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
      note: 'Original note',
      transactionType: 'expense',
    });
  });

  // Open the row for editing (tap-to-edit on the action row).
  await page.locator('.action-row__content').first().click();
  const dialog = page.getByRole('dialog', { name: en.editTransaction });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // A loaded edit is not dirty on its own: Escape closes it straight away.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Re-open, change the note, then try to leave.
  await page.locator('.action-row__content').first().click();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.locator('#txn-note').fill('Changed note');
  await page.keyboard.press('Escape');

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(en.addUnsavedTitle);

  // Cancelling keeps the user in the form with their edit intact.
  await confirm.getByRole('button', { name: en.actionCancel }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page.locator('#txn-note')).toHaveValue('Changed note');

  // Discarding closes without saving: the stored note is unchanged.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: en.addDiscard }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Original note', { exact: true })).toBeVisible();
  await expect(page.getByText('Changed note', { exact: true })).toHaveCount(0);
});
