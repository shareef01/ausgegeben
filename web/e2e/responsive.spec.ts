import { expect, test, type Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * Responsive and interaction checks from the 2026-11 UI/UX audit. Each test pins a defect that
 * was measured in a real browser, so a regression shows up as a number, not as a screenshot
 * someone has to notice. The wider sweep over the full viewport matrix lives in
 * qa/responsive-audit.mjs (run by hand against seeded data).
 */
const password = 'correct horse battery staple';

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

/** Seed categories plus a handful of transactions through the app's own repository. */
async function seedTransactions(page: Page, count = 6): Promise<void> {
  await page.evaluate(async (n) => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const cats = await repo.getAllCategories();
    const expense = cats.filter((c: { transactionType: string }) => c.transactionType === 'expense');
    const income = cats.filter((c: { transactionType: string }) => c.transactionType === 'income');
    for (let i = 0; i < n; i++) {
      const isIncome = i % 3 === 0;
      const cat = (isIncome ? income : expense)[i % (isIncome ? income.length : expense.length)];
      await repo.insertExpense({
        amount: isIncome ? 1234567.89 : 12.5 + i,
        dateMillis: Date.now() - i * 3_600_000,
        categoryId: cat.id,
        note: `Responsive probe ${i}`,
        transactionType: cat.transactionType,
      });
    }
  }, count);
  await page.locator('.transaction-row').first().waitFor();
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `horizontal page scroll — ${context}`).toBeLessThanOrEqual(client + 1);
}

async function gotoTab(page: Page, tab: 'record' | 'insights' | 'settings') {
  const nav = page.locator('.app-header__nav-item, .bottom-nav-pill__item');
  const label = { record: en.navRecord, insights: en.navInsights, settings: en.navSettings }[tab];
  await nav.filter({ hasText: label }).first().click();
  await expect(page).toHaveURL(new RegExp(tab === 'record' ? '.*' : `tab=${tab}`));
}

test('no horizontal overflow on either side of every layout breakpoint, both themes', async ({ browser }) => {
  // 2 themes × 6 widths, each with a fresh browser context and a full emulator sign-in.
  // The per-iteration assertions are fast; the budget is for twelve auth round-trips on a
  // loaded machine (the original 60 s cap was exceeded here without a single failed check).
  test.setTimeout(180_000);
  await createVerifiedUser('responsive-a@example.com', password);
  for (const colorScheme of ['dark', 'light'] as const) {
    for (const width of [767, 768, 1023, 1024, 1439, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const page = await context.newPage();
      await signIn(page, 'responsive-a@example.com', password);
      if (colorScheme === 'dark' && width === 767) await seedTransactions(page);
      else await page.locator('.transaction-row').first().waitFor();
      for (const tab of ['record', 'insights', 'settings'] as const) {
        await gotoTab(page, tab);
        await expectNoHorizontalOverflow(page, `${tab} @${width} ${colorScheme}`);
      }
      await context.close();
    }
  }
});

test('short transaction editors keep categories, notes and the CHF amount separate', async ({ browser }) => {
  const email = 'responsive-editor@example.com';
  await createVerifiedUser(email, password);
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await signIn(page, email, password);
  await seedTransactions(page);
  await page.evaluate(async () => {
    const path = '/src/services/preferencesStore.ts';
    const { usePreferencesStore } = await import(/* @vite-ignore */ path);
    usePreferencesStore.getState().setCurrency('CHF');
  });

  for (const [width, height] of [[320, 568], [360, 640], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.fab-add:visible').click();
    const dialog = page.getByRole('dialog');
    const currency = dialog.locator('.add-txn__currency');
    const categories = dialog.locator('.add-txn__cats');
    const note = dialog.locator('#txn-note');
    await expect(currency).toHaveText('CHF');
    await expect(categories.locator('button').first()).toBeVisible();
    const [prefixBox, amountBox, categoryBox, noteBox] = await Promise.all([
      currency.boundingBox(),
      dialog.locator('#txn-amount').boundingBox(),
      categories.boundingBox(),
      note.boundingBox(),
    ]);
    expect(amountBox!.x).toBeGreaterThanOrEqual(prefixBox!.x + prefixBox!.width);
    expect(noteBox!.y).toBeGreaterThanOrEqual(categoryBox!.y + categoryBox!.height);
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeInViewport();
    await expect(dialog.getByRole('button', { name: en.actionSave })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await context.close();
});

test('long history reveals rows in batches and searches the full history', async ({ page }) => {
  const email = 'long-history@example.com';
  await createVerifiedUser(email, password);
  await signIn(page, email, password);
  await seedTransactions(page, 66);
  await page.locator('.record-filters .period-select__trigger').click();
  await page.getByRole('option', { name: en.recordPeriodAllTime }).click();

  const rows = page.locator('.txn-row-wrap');
  await expect(rows).toHaveCount(60);
  await page.getByRole('button', { name: en.recordShowMoreRows }).click();
  await expect(rows).toHaveCount(66);
  await expect(rows.nth(60).locator('.action-row__content')).toBeFocused();

  await page.getByRole('searchbox', { name: en.recordSearchPlaceholder }).fill('Responsive probe 65');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Responsive probe 65');
});

test('pending changes keep their status visible across tabs until acknowledged', async ({ page }) => {
  const email = 'pending-status@example.com';
  await createVerifiedUser(email, password);
  await signIn(page, email, password);
  await page.evaluate(async () => {
    const path = '/src/services/queuedWrites.ts';
    const { trackQueuedWrite } = await import(/* @vite-ignore */ path);
    trackQueuedWrite(new Promise<void>((resolve) => {
      addEventListener('test-write-acknowledged', () => resolve(), { once: true });
    }));
  });

  const status = page.getByRole('status').filter({ hasText: en.queuedWritesKeepTabOpen });
  await expect(status).toBeVisible();
  await gotoTab(page, 'settings');
  await expect(status).toBeVisible();
  await page.evaluate(() => dispatchEvent(new Event('test-write-acknowledged')));
  await expect(status).toHaveCount(0);
});

test('a long toast wraps inside a 320px screen and keeps its action reachable', async ({ browser }) => {
  await createVerifiedUser('responsive-toast@example.com', password);
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, 'responsive-toast@example.com', password);

  const message = 'The transaction could not be saved because the connection dropped before the server confirmed it';
  await page.evaluate(async (text) => {
    const path = '/src/services/toastStore.ts';
    const { useToastStore } = await import(/* @vite-ignore */ path);
    useToastStore.getState().show(text, 'retry', () => {});
  }, message);

  const toast = page.locator('.toast-host');
  await expect(toast).toBeVisible();
  // The live region existed before the message arrived, and now carries it.
  await expect(page.getByRole('status').filter({ hasText: message })).toHaveCount(1);

  const box = (await toast.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(321);
  const text = toast.locator('.toast-host__message');
  const clipped = await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, 'toast message is clipped instead of wrapping').toBe(false);
  // Wrapped text, not one word per line: the message keeps most of the toast's width.
  expect((await text.boundingBox())!.width).toBeGreaterThan(box.width * 0.6);
  await expect(toast.getByRole('button', { name: 'retry' })).toBeInViewport();
  await context.close();
});

test('onboarding step buttons are separate targets of at least 24px', async ({ browser }) => {
  await createVerifiedUser('responsive-onboarding@example.com', password);
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#auth-email').fill('responsive-onboarding@example.com');
  await page.locator('#auth-password').fill(password);
  await page.locator('form button[type="submit"]').click();

  const dots = page.getByRole('group', { name: en.onboardingStepsLabel }).getByRole('button');
  await expect(dots.first()).toBeVisible();
  const boxes = await dots.evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height };
  }));
  expect(boxes.length).toBeGreaterThan(1);
  for (const [i, b] of boxes.entries()) {
    expect(b.width, `step ${i + 1} width`).toBeGreaterThanOrEqual(24);
    expect(b.height, `step ${i + 1} height`).toBeGreaterThanOrEqual(24);
    if (i > 0) expect(b.left, `step ${i + 1} overlaps step ${i}`).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
  }

  // Tapping the last dot goes to the last step and marks it current.
  await dots.last().click();
  await expect(dots.last()).toHaveAttribute('aria-current', 'step');
  await context.close();
});

test('phone filters: labelled type filter and 16px / 44px inputs on touch', async ({ browser }) => {
  await createVerifiedUser('responsive-filters@example.com', password);
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await signIn(page, 'responsive-filters@example.com', password);
  await seedTransactions(page, 3);

  await page.getByRole('button', { name: en.recordShowFilters, exact: true }).click();
  const typeFilter = page.getByRole('radiogroup', { name: en.recordTypeFilter });
  for (const label of [en.filterAll, en.filterExpense, en.filterIncome, en.filterTransfer]) {
    const option = typeFilter.getByRole('radio', { name: label, exact: true });
    // The name comes from visible text, not from a hover-only tooltip.
    await expect(option).toContainText(label);
    const clipped = await option.locator('.segmented__label').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `"${label}" is truncated`).toBe(false);
  }

  for (const selector of ['#record-min-amount', '#record-max-amount', '#record-sort-select']) {
    const field = page.locator(selector);
    const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, `${selector} font-size (iOS zooms under 16px)`).toBeGreaterThanOrEqual(16);
    expect((await field.boundingBox())!.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalOverflow(page, 'record @320 with filters open');
  await context.close();
});

test('wide Record: columns, reading order and tab order agree, and nothing scrolls inside itself', async ({ browser }) => {
  await createVerifiedUser('responsive-wide@example.com', password);
  for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await signIn(page, 'responsive-wide@example.com', password);
    if (width === 1440) await seedTransactions(page, 8);
    else await page.locator('.transaction-row').first().waitFor();

    const x = async (selector: string) => (await page.locator(selector).first().boundingBox())!.x;
    const summaryX = await x('.sidebar-layout--record .widget-stack');
    const filtersX = await x('.sidebar-layout--record .record-filters');
    const listX = await x('.sidebar-layout--record > .content-col');
    expect(summaryX).toBeLessThan(filtersX);
    expect(filtersX).toBeLessThan(listX);

    // Tab from the main landmark: focus reaches the filters before the list, and every step
    // moves right or down, never back to an earlier column.
    await page.locator('#app-main').focus();
    let lastX = -1;
    let reachedList = false;
    for (let i = 0; i < 40 && !reachedList; i++) {
      await page.keyboard.press('Tab');
      const pos = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.closest('.sidebar-layout--record')) return null;
        return { x: el.getBoundingClientRect().left, inList: !!el.closest('.content-col') };
      });
      if (!pos) continue;
      expect(pos.x, 'focus jumped back to a column further left').toBeGreaterThanOrEqual(lastX - 300);
      if (pos.inList) {
        reachedList = true;
        expect(pos.x).toBeGreaterThanOrEqual(listX - 1);
      }
      lastX = Math.max(lastX, pos.x);
    }
    expect(reachedList, 'Tab never reached the transaction list').toBe(true);

    const nested = await page.evaluate(() =>
      [...document.querySelectorAll('.sidebar-layout--record *')].filter((el) => {
        const s = getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2;
      }).map((el) => el.className),
    );
    expect(nested, 'a side column scrolls inside itself').toEqual([]);
    await context.close();
  }
});

test('Insights splits the category cards by the content column, not the viewport', async ({ browser }) => {
  await createVerifiedUser('responsive-insights@example.com', password);
  const columns = async (width: number) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await signIn(page, 'responsive-insights@example.com', password);
    if (width === 1024) await seedTransactions(page, 9);
    else await page.locator('.transaction-row').first().waitFor();
    await gotoTab(page, 'insights');
    const cards = page.locator('.insights-breakdown .insights-category-card');
    await expect(cards.first()).toBeVisible();
    const xs = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    await context.close();
    return new Set(xs).size;
  };
  // At 1024px the column beside the sidebar is ~640px: one card per row.
  expect(await columns(1024)).toBe(1);
  // At 1280px it is ~860px: two side by side.
  expect(await columns(1280)).toBe(2);
});
