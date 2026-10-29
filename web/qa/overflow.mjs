/**
 * Horizontal-overflow sweep of the real app (emulator + seeded accounts, see style-snapshot.mjs).
 *
 *   node qa/overflow.mjs <label>
 *
 * For each account × phone width × tab, reports the page's scroll width and any element that
 * runs past the viewport, and saves a full-page Insights screenshot to ../docs/design-qa/css/.
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [label = 'now'] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', 'css');
let failed = 0;
const browser = await chromium.launch();
for (const [account, email, password] of [
  ['demo', 'demo@ausgegeben.app', 'demo-password-123'],
  ['heavy', 'qa-heavy@ausgegeben.test', 'qa-password-123'],
]) {
  for (const w of [320, 375, 390, 430]) {
    // Not isMobile: a desktop viewport reports overflow as scroll width instead of zooming out.
    const context = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: 'reduce', colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    await page.locator('#auth-email').fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.locator('.transaction-row').first().waitFor({ timeout: 30000 });
    for (const [i, tab] of ['record', 'insights', 'settings'].entries()) {
      await page.locator('.bottom-nav-pill__item, .app-header__nav-item').nth(i).dispatchEvent('click');
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const vw = innerWidth;
        const wide = [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('.cashflow-table__scroll'))
          .map((e) => `${(e.className.baseVal ?? e.className).toString().split(' ')[0]} →${Math.round(e.getBoundingClientRect().right)}`);
        return { sw: document.documentElement.scrollWidth, vw, wide: [...new Set(wide)].slice(0, 4) };
      });
      const ok = r.sw <= r.vw;
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${account} ${tab} @${w}: page ${r.sw}px wide${ok ? '' : `  — ${r.wide.join(', ')}`}`);
      if (tab === 'insights' && account === 'heavy' && w === 375) {
        await page.screenshot({ path: join(OUT, `${label}-overflow-heavy-375-insights.png`), fullPage: true });
      }
    }
    await context.close();
  }
}
await browser.close();
console.log(failed ? `\n${failed} screens overflow (${label})` : `\nno overflow (${label})`);
