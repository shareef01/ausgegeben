/**
 * Screens that need live data: onboarding, empty account, offline banner, a save queued while
 * offline, the unsaved-changes confirmation, and every main screen at 200% text size.
 * Runs against the emulator-backed app (see style-snapshot.mjs for setup).
 *
 *   node qa/states.mjs <label>     → ../docs/design-qa/states/<label>-*.png, plus overflow checks
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [label = 'now'] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', 'states');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5173';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: join(OUT, `${label}-${name}.png`), fullPage });
const overflow = (page) => page.evaluate(() => {
  const vw = innerWidth;
  const wide = [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('.cashflow-table__scroll, .add-txn__cats'))
    .map((e) => (e.className.baseVal ?? e.className).toString().split(' ')[0]);
  return { sw: document.documentElement.scrollWidth, vw, wide: [...new Set(wide)].slice(0, 4) };
});
const tabs = (page, i) => page.locator('.bottom-nav-pill__item, .app-header__nav-item').nth(i).dispatchEvent('click');

const browser = await chromium.launch();
async function open(width, height, { scheme = 'dark', bigText = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', colorScheme: scheme });
  if (bigText) await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'html { font-size: 200% !important; }';
      document.head.append(s);
    });
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page };
}
async function signIn(page, email, password) {
  await page.locator('#auth-email').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
}

// ── Onboarding: a brand-new verified account ──
for (const [w, h, locale] of [[375, 812, 'en'], [375, 812, 'de'], [1440, 900, 'en']]) {
  const email = `qa-onboard-${locale}-${w}-${Date.now()}@ausgegeben.test`;
  const su = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'qa-password-123', returnSecureToken: true }),
  }).then((r) => r.json());
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: su.localId, emailVerified: true }),
  });
  const { context, page } = await open(w, h);
  if (locale === 'de') await page.evaluate(async () => {
    const { usePreferencesStore } = await import(/* @vite-ignore */ '/src/services/preferencesStore.ts');
    usePreferencesStore.getState().setLocale('de');
  });
  await signIn(page, email, 'qa-password-123');
  await page.locator('.onboarding-page').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await shot(page, `onboarding-${locale}-${w}`);
  const o = await overflow(page);
  check(`onboarding ${locale}@${w}: fits`, o.sw <= o.vw, o.wide.join(', '));
  await context.close();
}

// ── Empty account (dataset A) ──
{
  const { context, page } = await open(375, 812);
  await signIn(page, 'qa-empty@ausgegeben.test', 'qa-password-123');
  await page.locator('.empty-state, .bottom-nav-pill').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'empty-record-375');
  await tabs(page, 1);
  await page.waitForTimeout(800);
  await shot(page, 'empty-insights-375');
  await context.close();
}

// ── Offline: banner, a save that queues, and the unsaved-changes guard ──
{
  const { context, page } = await open(375, 812);
  await signIn(page, 'qa-heavy@ausgegeben.test', 'qa-password-123');
  await page.locator('.transaction-row').first().waitFor({ timeout: 30000 });
  // Open the add sheet once while online: offline mode also cuts off the dev server, which
  // would otherwise fail to serve its lazily loaded code (the installed PWA has it cached).
  await page.locator('.fab-add').first().dispatchEvent('click');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await page.waitForTimeout(600);
  const banner = await page.locator('.offline-banner').count();
  check('offline: banner appears', banner === 1);
  await shot(page, 'offline-banner-375');

  await page.locator('.fab-add').first().dispatchEvent('click');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.locator('#txn-amount').fill('12,34');
  await page.locator('.add-txn__cat').first().click();
  await shot(page, 'offline-add-filled-375');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const guard = await page.getByRole('alertdialog').count();
  check('unsaved changes: Escape asks before discarding', guard === 1);
  await shot(page, 'unsaved-confirm-375');
  if (guard) await page.getByRole('alertdialog').getByRole('button').first().click(); // keep editing
  await page.waitForTimeout(300);
  await page.locator('.add-txn__save').click();
  await page.waitForTimeout(1200);
  const toast = (await page.locator('.toast-host').textContent()) ?? '';
  check('offline save: confirms it was queued, not saved', /warteschlange|queued|offline|in diesem tab|this tab|sobald|sync/i.test(toast), toast.trim());
  await shot(page, 'offline-queued-toast-375');
  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);
  check('back online: banner clears', (await page.locator('.offline-banner').count()) === 0);
  await context.close();
}

// ── 200% text on every main screen ──
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { context, page } = await open(w, h, { bigText: true });
  await signIn(page, 'qa-heavy@ausgegeben.test', 'qa-password-123');
  await page.locator('.transaction-row').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  for (const [i, tab] of ['record', 'insights', 'settings'].entries()) {
    await tabs(page, i);
    await page.waitForTimeout(900);
    await shot(page, `text200-${tab}-${w}`);
    const o = await overflow(page);
    check(`200% text ${tab}@${w}: no sideways scroll`, o.sw <= o.vw, `${o.sw}px ${o.wide.join(', ')}`);
  }
  await tabs(page, 0);
  await page.waitForTimeout(600);
  await page.locator('.action-row__content').first().dispatchEvent('click');
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(500);
  await shot(page, `text200-edit-${w}`);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    const save = document.querySelector('.add-txn__save');
    return { fits: r.right <= innerWidth + 1, saveReachable: Boolean(save) && (d.scrollHeight <= d.clientHeight || getComputedStyle(d).overflowY !== 'visible' || [...d.querySelectorAll('*')].some((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)) };
  });
  check(`200% text edit sheet@${w}: fits and scrolls to Save`, dlg.fits && dlg.saveReachable, JSON.stringify(dlg));
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED (${label})` : `\nall state checks passed (${label})`);
