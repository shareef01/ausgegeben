import { test, expect, type Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

const password = 'correct horse battery staple';
test.beforeEach(async () => { await resetAuthEmulator(); await resetFirestoreEmulator(); });

/** The Settings → Data row (a SettingsRow, so its name also carries the subtitle). */
const launchRow = (page: Page) => page.getByRole('button', { name: new RegExp(`^${en.recurringTitle}`) });
const subscriptionsTile = (scope: ReturnType<Page['getByRole']>) =>
  scope.getByRole('button', { name: en.catSubscriptions, exact: true });

test('Settings recurring controls create, pause, edit and delete without removing records', async ({ page }) => {
  await createVerifiedUser('recurring@example.com', password);
  await signIn(page, 'recurring@example.com', password);
  await page.getByRole('button', { name: en.navSettings }).click();
  await expect(launchRow(page)).toContainText(en.recurringSub);
  await launchRow(page).click();

  const panel = page.getByRole('dialog', { name: en.recurringTitle });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(en.recurringIntro);
  await expect(panel).toContainText(en.recurringEmpty);
  await panel.getByRole('button', { name: en.recurringNew }).click();

  const editor = page.getByRole('dialog', { name: en.recurringNew });
  await expect(editor).toBeVisible();
  // A new item never starts with a made-up amount.
  await expect(editor.getByLabel(en.addAmountLabel, { exact: true })).toHaveValue('');
  await editor.getByLabel(en.addAmountLabel, { exact: true }).fill('1,234.56');
  await editor.getByLabel(en.noteLabel, { exact: true }).fill('Recurring UI test');
  await subscriptionsTile(editor).click();
  await editor.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(editor).toHaveCount(0);

  // Saving catches up on its own: today's occurrence is recorded and "next" moves past today.
  const row = panel.getByTestId('recurring-item').filter({ hasText: 'Recurring UI test' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(en.recurringEveryMonth);
  await expect(row).toContainText('next on');
  await row.getByRole('button', { name: en.recurringPause, exact: true }).click();
  await expect(row).toContainText(en.recurringPaused);
  await row.getByRole('button', { name: en.recurringResume, exact: true }).click();
  await expect(row).not.toContainText(en.recurringPaused);

  await row.getByRole('button', { name: en.recurringEdit, exact: true }).click();
  const edit = page.getByRole('dialog', { name: en.recurringEditTitle });
  await expect(edit.getByLabel(en.addAmountLabel, { exact: true })).toHaveValue('1234.56');
  await edit.getByLabel(en.addAmountLabel, { exact: true }).fill('17');
  await edit.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(row).toContainText('17.00');

  await row.getByRole('button', { name: en.actionDelete, exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: en.recurringDelete });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(en.recurringDeleteMessage);
  await confirm.getByRole('button', { name: en.actionDelete, exact: true }).click();
  await expect(row).toHaveCount(0);
  await panel.getByRole('button', { name: en.actionClose, exact: true }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole('button', { name: en.navRecord, exact: true }).click();
  await expect(page.getByText('Recurring UI test', { exact: true })).toBeVisible();
});

test('escape asks before throwing away an unsaved recurring draft', async ({ page }) => {
  await createVerifiedUser('recurring-draft@example.com', password);
  await signIn(page, 'recurring-draft@example.com', password);
  await page.getByRole('button', { name: en.navSettings }).click();
  await launchRow(page).click();
  const panel = page.getByRole('dialog', { name: en.recurringTitle });
  await panel.getByRole('button', { name: en.recurringNew }).click();
  const editor = page.getByRole('dialog', { name: en.recurringNew });
  await editor.getByLabel(en.addAmountLabel, { exact: true }).fill('42');

  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: en.addUnsavedTitle });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: en.actionCancel, exact: true }).click();
  await expect(editor.getByLabel(en.addAmountLabel, { exact: true })).toHaveValue('42');

  await editor.getByRole('button', { name: en.actionClose, exact: true }).click();
  await page.getByRole('alertdialog', { name: en.addUnsavedTitle }).getByRole('button', { name: en.addDiscard, exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(en.recurringEmpty);

  // An untouched draft closes straight away.
  await panel.getByRole('button', { name: en.recurringNew }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: en.recurringNew })).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('keyboard escape closes the manager and restores launch-button focus', async ({ page }) => {
  await createVerifiedUser('keyboard@example.com', password);
  await signIn(page, 'keyboard@example.com', password);
  await page.getByRole('button', { name: en.navSettings }).click();
  const launch = launchRow(page);
  await launch.click();
  await expect(page.getByRole('dialog', { name: en.recurringTitle })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: en.recurringTitle })).toHaveCount(0);
  await expect(launch).toBeFocused();
});
