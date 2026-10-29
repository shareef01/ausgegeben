/**
 * Checks for three small fixes, against the emulator-backed app (see style-snapshot.mjs):
 *   - deleting a row (menu or Delete key) leaves keyboard focus on a neighbouring row
 *   - the cash-flow tooltip never covers the y-axis labels when there is room
 *   - category tiles show long names in full (up to three lines)
 *
 *   node qa/polish-checks.mjs
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', 'states');
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'dark' });
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.locator('#auth-email').fill('qa-heavy@ausgegeben.test');
await page.locator('input[type="password"]').first().fill('qa-password-123');
await page.locator('button[type="submit"]').first().click();
await page.locator('.transaction-row').nth(3).waitFor({ timeout: 30000 });

const focusedRowLabel = () => page.evaluate(() =>
  document.activeElement?.classList.contains('action-row__content') ? document.activeElement.getAttribute('aria-label') : null);

// Delete via the keyboard shortcut.
const rows = page.locator('.action-row__content');
const secondLabel = await rows.nth(1).getAttribute('aria-label');
await rows.first().focus();
await page.keyboard.press('Delete');
await page.waitForTimeout(400);
check('Delete key: focus moves to the next row', (await focusedRowLabel()) === secondLabel, `focused: ${await focusedRowLabel()}`);
await page.getByRole('button', { name: /rückgängig|undo/i }).click().catch(() => {});
await page.waitForTimeout(600);

// Delete via the menu, opened from the keyboard.
await rows.first().focus();
const nextLabel = await rows.nth(1).getAttribute('aria-label');
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.getByRole('menu').waitFor();
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('menu delete: focus moves to the next row', (await focusedRowLabel()) === nextLabel, `focused: ${await focusedRowLabel()}`);
await page.getByRole('button', { name: /rückgängig|undo/i }).click().catch(() => {});

// Tooltip vs y-axis labels, at a phone width and desktop.
for (const w of [375, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.locator('.bottom-nav-pill__item, .app-header__nav-item').nth(1).dispatchEvent('click');
  await page.waitForTimeout(900);
  const plot = page.locator('.cashflow-chart__plot');
  await plot.scrollIntoViewIfNeeded();
  await plot.focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const tip = document.querySelector('.cashflow-tooltip')?.getBoundingClientRect();
    // y-axis labels only: end-anchored *and* in the left gutter (the last month label is end-anchored too).
    const svgLeft = document.querySelector('.cashflow-chart__svg').getBoundingClientRect().left;
    const labels = [...document.querySelectorAll('.cashflow-chart__svg text[text-anchor="end"]')]
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.right - svgLeft < 120);
    const axisRight = Math.max(...labels.map((l) => l.right));
    const plotBox = document.querySelector('.cashflow-chart__plot').getBoundingClientRect();
    return { tipLeft: tip?.left, tipW: tip?.width, axisRight, plotW: plotBox.width };
  });
  const roomForBoth = r.plotW - (r.axisRight - (r.tipLeft ?? 0)) >= r.tipW; // informational
  check(`chart@${w}: tooltip clears the y-axis labels`, r.tipLeft >= r.axisRight - 0.5 || !roomForBoth,
    `tooltip left ${r.tipLeft?.toFixed(0)}, axis labels end ${r.axisRight.toFixed(0)}`);
  if (w === 375) await page.screenshot({ path: join(OUT, 'after-chart-tooltip-375.png') });
}

// Category names in the add sheet.
await page.setViewportSize({ width: 375, height: 812 });
await page.locator('.bottom-nav-pill__item, .app-header__nav-item').nth(0).dispatchEvent('click');
await page.waitForTimeout(600);
await page.locator('.fab-add').first().dispatchEvent('click');
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(400);
// Names up to 30 characters must be complete; longer ones may clamp after three lines (the full
// name stays in the tooltip and the accessible name).
const clipped = await page.$$eval('.add-txn__cat-name', (els) => els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
check('category tiles: names up to 30 characters are complete', clipped.every((n) => n.length > 30), `clamped: ${clipped.join(' | ') || 'none'}`);
await page.locator('.add-txn__cats').screenshot({ path: join(OUT, 'after-category-names-375.png') });

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall polish checks passed');
