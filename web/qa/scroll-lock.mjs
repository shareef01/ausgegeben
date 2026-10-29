/**
 * Modal scroll-lock check in Chromium (Android Chrome's engine) and WebKit (Safari's), against
 * the emulator-backed app with the heavy QA account (see style-snapshot.mjs for setup).
 *
 *   node qa/scroll-lock.mjs
 *
 * Scrolls the Record list, opens the edit sheet, tries to scroll the page behind it, closes it,
 * and checks the page neither moved while locked nor jumped on unlock.
 */
import { chromium, webkit } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: engineName === 'chromium', // Playwright's WebKit on Windows has no mobile mode
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('#auth-email').fill('qa-heavy@ausgegeben.test');
  await page.locator('input[type="password"]').first().fill('qa-password-123');
  await page.locator('button[type="submit"]').first().click();
  await page.locator('.transaction-row').nth(20).waitFor({ timeout: 30000 });

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(300);
  const startY = await page.evaluate(() => window.scrollY);
  // A row in the middle of the screen is the visual reference.
  const refTop = () => page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.txn-row-wrap');
    if (el) el.setAttribute('data-qa-ref', '1');
    return document.querySelector('[data-qa-ref]')?.getBoundingClientRect().top ?? null;
  });
  const before = await refTop();

  await page.locator('[data-qa-ref] .action-row__content').dispatchEvent('click');
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  const locked = await page.evaluate(() => document.body.classList.contains('is-scroll-locked'));
  const whileOpen = await page.evaluate(() => document.querySelector('[data-qa-ref]')?.getBoundingClientRect().top ?? null);
  check(`${engineName}: body is locked while the sheet is open`, locked);
  check(`${engineName}: page does not jump when the sheet opens`, before !== null && Math.abs(whileOpen - before) < 1, `ref ${before} → ${whileOpen}`);

  // Try to scroll the page behind the sheet: wheel over the backdrop area at the very top.
  await page.mouse.move(195, 20);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  const afterWheel = await page.evaluate(() => document.querySelector('[data-qa-ref]')?.getBoundingClientRect().top ?? null);
  check(`${engineName}: page behind the sheet does not scroll`, Math.abs(afterWheel - before) < 1, `ref ${before} → ${afterWheel}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const confirm = page.getByRole('alertdialog');
  if (await confirm.count()) await confirm.getByRole('button').last().click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  const endY = await page.evaluate(() => window.scrollY);
  const after = await page.evaluate(() => document.querySelector('[data-qa-ref]')?.getBoundingClientRect().top ?? null);
  const unlocked = await page.evaluate(() => !document.body.classList.contains('is-scroll-locked'));
  check(`${engineName}: lock released and scroll position restored`, unlocked && endY === startY && Math.abs(after - before) < 1, `scrollY ${startY} → ${endY}, ref ${before} → ${after}`);

  await browser.close();
}

console.log(failed ? `\n${failed} FAILED` : '\nall scroll-lock checks passed');
process.exit(failed ? 1 : 0);
