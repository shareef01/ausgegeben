import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

/**
 * DW-1 — the mobile dock now carries visible labels, and the acceptance criterion "all primary
 * screens work at 320 px" has to be measured, not asserted. These checks are cheap and catch the
 * two failure modes a redesign actually introduces: a horizontal scrollbar, and a touch target
 * that shrank below the platform minimum while gaining text.
 */

const password = 'correct horse battery staple';

/** Widths from the brief; 320 is the narrowest supported phone. */
const MOBILE_WIDTHS = [320, 375, 390, 430] as const;

test.beforeEach(async () => {
  await resetAuthEmulator();
  await resetFirestoreEmulator();
});

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, width: number) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(
    overflow.scroll,
    `document scrolls horizontally at ${width}px (scrollWidth ${overflow.scroll} > clientWidth ${overflow.client})`,
  ).toBeLessThanOrEqual(overflow.client + 1);
}

test('mobile dock: labels are visible and nothing overflows at 320-430px', async ({ page }) => {
  await createVerifiedUser('layout-a@example.com', password);

  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 720 });
    await signIn(page, 'layout-a@example.com', password);

    const dock = page.locator('.mobile-dock');
    await expect(dock).toBeVisible();
    await expectNoHorizontalOverflow(page, width);

    // Every nav item shows its label, and the label is the accessible name.
    for (const label of [en.navRecord, en.navInsights, en.navSettings]) {
      const item = dock.getByRole('button', { name: label });
      await expect(item).toBeVisible();
      await expect(item.locator('.bottom-nav-pill__label')).toBeVisible();
      const box = await item.boundingBox();
      expect(box, `${label} has no box at ${width}px`).not.toBeNull();
      // 44px is the platform minimum; the label must not have eaten into it.
      expect(box!.width).toBeGreaterThanOrEqual(43);
      expect(box!.height).toBeGreaterThanOrEqual(43);
    }

    // The dock itself stays inside the viewport.
    const dockBox = (await dock.boundingBox())!;
    expect(dockBox.x).toBeGreaterThanOrEqual(0);
    expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(width + 1);

    // Sign out so the next width starts from the auth screen.
    await page.evaluate(async () => {
      const path = '/src/services/authService.ts';
      const mod = await import(/* @vite-ignore */ path);
      await mod.authService.signOut();
    });
  }
});

test('desktop switches to the header rail and still has no overflow', async ({ page }) => {
  await createVerifiedUser('layout-b@example.com', password);

  for (const width of [768, 1024, 1440] as const) {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'layout-b@example.com', password);

    // The mobile dock is not mounted at all on desktop, so it is neither visible nor tabbable.
    await expect(page.locator('.mobile-dock')).toHaveCount(0);
    const rail = page.getByRole('navigation', { name: en.navMain }).first();
    await expect(rail).toBeVisible();
    await expectNoHorizontalOverflow(page, width);

    await page.evaluate(async () => {
      const path = '/src/services/authService.ts';
      const mod = await import(/* @vite-ignore */ path);
      await mod.authService.signOut();
    });
  }
});
