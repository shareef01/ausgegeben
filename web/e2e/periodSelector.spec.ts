import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * UX-5 — the period selector is a WAI-ARIA listbox, verified in a real browser.
 *
 * The unit tests in `web/src/utils/listbox.test.ts` only prove the index arithmetic; keyboard
 * interaction, focus movement, the accessible name and the selection state are DOM behaviours
 * that only this spec can actually check.
 */

const password = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

const trigger = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: new RegExp(`^${en.periodSelectorLabel}`, 'i') });

test('period listbox: name, focus, arrow keys, Home/End, Enter and Escape', async ({ page }) => {
  await createVerifiedUser('period-a@example.com', password);
  await signIn(page, 'period-a@example.com', password);

  const button = trigger(page);
  // The trigger is named by the hidden "period" label plus the current value, so it is not an
  // unnamed icon button any more.
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  // Keyboard opens the popup and focus lands on the selected option, not on the trigger.
  await button.focus();
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox', { name: en.periodSelectorLabel });
  await expect(listbox).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const options = listbox.getByRole('option');
  const count = await options.count();
  expect(count).toBeGreaterThan(1);
  await expect(options.first()).toBeFocused();

  // Arrow keys move focus, and wrap at the end.
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(options.nth(count - 1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(options.nth(count - 1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(options.first()).toBeFocused();

  // Escape closes without changing the selection and returns focus to the trigger.
  const labelBefore = await button.getAttribute('aria-labelledby');
  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-labelledby', labelBefore ?? '');

  // Re-open with the mouse, choose a different option with the keyboard, and check the
  // selection is applied, announced through aria-selected, and focus comes back.
  await button.click();
  const target = listbox.getByRole('option').nth(1);
  const targetText = (await target.textContent()) ?? '';
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toContainText(targetText.trim());

  // The popped-up option carries the selected state (scoped to this listbox: the sort-order
  // control also exposes aria-selected options).
  await button.click();
  await expect(
    page.getByRole('listbox', { name: en.periodSelectorLabel }).getByRole('option', { selected: true }),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
});

test('period listbox: pointer selection still works and only one option is tabbable', async ({ page }) => {
  await createVerifiedUser('period-b@example.com', password);
  await signIn(page, 'period-b@example.com', password);

  const button = trigger(page);
  await button.click();
  const options = page.getByRole('listbox').getByRole('option');
  const first = options.first();
  await first.click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(button).toBeFocused();

  // Roving tabindex: exactly one option is in the tab order while the popup is open, so Tab
  // does not walk every month.
  await button.click();
  const tabbable = await page.locator('[role="option"][tabindex="0"]').count();
  expect(tabbable).toBe(1);
  await page.keyboard.press('Escape');
});
