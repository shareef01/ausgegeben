import { expect, test, type Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * AUS-303: the Settings pickers use buttons with role="radio", and ARIA roles add no
 * keyboard behavior. Every option was its own Tab stop and the arrow keys did nothing.
 * Now the group has one Tab stop (the checked option) and the arrows move focus through
 * the options without selecting; Enter or Space picks.
 */
const PASSWORD = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

/** role and aria-checked of the focused element, plus its visible label. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      role: el?.getAttribute('role') ?? null,
      checked: el?.getAttribute('aria-checked') ?? null,
      text: (el?.textContent ?? '').trim(),
    };
  });
}

async function openThemePicker(page: Page) {
  const row = page.getByRole('button').filter({ hasText: en.settingsTheme }).first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radiogroup', { name: en.settingsChooseTheme })).toBeVisible();
}

test('theme picker: one Tab stop, arrows move focus without selecting, Enter picks', async ({ page }) => {
  const email = `pickers-${test.info().workerIndex}@example.com`;
  await createVerifiedUser(email, PASSWORD);
  await signIn(page, email, PASSWORD, false, '/?tab=settings');
  await expect(page.getByRole('heading', { name: en.screenSettings })).toBeVisible();

  await openThemePicker(page);
  const group = page.getByRole('radiogroup', { name: en.settingsChooseTheme });
  const radios = group.getByRole('radio');
  const count = await radios.count();
  expect(count).toBeGreaterThan(2);

  // Exactly one option is in the Tab order, and it is the checked one.
  const tabIndexes = await radios.evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
  expect(tabIndexes.filter((i) => i === 0)).toHaveLength(1);
  const checkedIndex = await radios.evaluateAll((els) => els.findIndex((el) => el.getAttribute('aria-checked') === 'true'));
  expect(tabIndexes[checkedIndex]).toBe(0);

  // Tab until focus enters the group: it lands on the checked option.
  for (let i = 0; i < 5 && (await focused(page)).role !== 'radio'; i++) await page.keyboard.press('Tab');
  expect(await focused(page)).toMatchObject({ role: 'radio', checked: 'true' });

  // ArrowDown moves focus to the next option but does not select it or close the picker.
  await page.keyboard.press('ArrowDown');
  const afterDown = await focused(page);
  expect(afterDown).toMatchObject({ role: 'radio', checked: 'false' });
  await expect(radios.nth((checkedIndex + 1) % count)).toBeFocused();
  await expect(group).toBeVisible();

  // Home / End and wrapping.
  await page.keyboard.press('End');
  await expect(radios.nth(count - 1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(radios.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(radios.nth(count - 1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(radios.nth(0)).toBeFocused();

  // Tab leaves the group in one step: no other option is a Tab stop.
  await page.keyboard.press('Tab');
  expect((await focused(page)).role).not.toBe('radio');
  await page.keyboard.press('Shift+Tab');
  expect(await focused(page)).toMatchObject({ role: 'radio', checked: 'true' });

  // Pick a different option with Enter: it applies and closes the picker.
  const target = (checkedIndex + 1) % count;
  const targetLabel = ((await radios.nth(target).textContent()) ?? '').trim();
  await page.keyboard.press(target === 0 ? 'Home' : 'ArrowDown');
  await expect(radios.nth(target)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(group).toBeHidden();

  await openThemePicker(page);
  await expect(page.getByRole('radio', { name: targetLabel, exact: true })).toHaveAttribute('aria-checked', 'true');
});
