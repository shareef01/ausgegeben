/**
 * Design-QA capture: screenshots plus scripted interaction checks against qa/harness.html.
 *
 *   npx vite --port 5173                         (this checkout)
 *   node qa/capture.mjs after http://127.0.0.1:5173
 *   node qa/capture.mjs before http://127.0.0.1:5174   (a HEAD checkout serving the same harness)
 *
 * Writes PNGs to ../docs/design-qa/<label>/ and prints one PASS/FAIL line per check.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [label = 'after', base = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', label);
mkdirSync(OUT, { recursive: true });

const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const url = (params) => `${base}/qa/harness.html?${new URLSearchParams(params)}`;

const browser = await chromium.launch();

async function open(params, { width = 375, height = 667, touch = false, scheme = 'dark' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(url(params), { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  return { context, page };
}

const qaLog = (page) => page.evaluate(() => window.__qa.log.slice());
const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ── 1. Full harness at every QA width, heavy German/CHF data, dark and light ──
for (const theme of ['dark', 'light']) {
  for (const [w, h] of SIZES) {
    const { context, page } = await open({ section: 'all', theme, data: 'heavy', locale: 'de', currency: 'CHF' }, { width: w, height: h, touch: w < 768 });
    await page.screenshot({ path: join(OUT, `all-${theme}-${w}x${h}.png`), fullPage: true });
    check(`no horizontal page scroll at ${w}px (${theme})`, await noHorizontalScroll(page));
    await context.close();
  }
}

// ── 1b. Amount sweep: every currency × locale at the narrowest and widest size ──
for (const currency of ['EUR', 'USD', 'GBP', 'CHF']) {
  for (const locale of ['en', 'de']) {
    for (const [w, h] of [[320, 568], [1440, 900]]) {
      const { context, page } = await open({ section: 'all', theme: 'dark', data: 'heavy', locale, currency }, { width: w, height: h, touch: w < 768 });
      const clipped = await page.evaluate(() => {
        const sel = '.transaction-row__amount, .money, .finance-stat-chip__value, .finance-summary-card__balance, .donut-center__value, .insights-category-card__amount, .budget-bar__labels, .cashflow-tooltip__value, .cashflow-table__table td';
        const out = [];
        for (const e of document.querySelectorAll(sel)) {
          const r = e.getBoundingClientRect();
          if (r.width === 0) continue;
          if (e.scrollWidth > e.clientWidth + 1 || r.right > window.innerWidth + 1) out.push(e.textContent);
        }
        return out;
      });
      if (w === 320 && currency === 'CHF' && locale === 'de') await page.screenshot({ path: join(OUT, 'summary-heavy-320-de-chf.png'), fullPage: false });
      check(`amounts unclipped: ${currency}/${locale} @${w}`, clipped.length === 0, clipped.slice(0, 3).join(' | '));
      await context.close();
    }
  }
}

// ── 2. Transaction rows ──
{
  const { context, page } = await open({ section: 'rows', theme: 'dark', data: 'heavy', locale: 'de', currency: 'CHF' }, { width: 320, height: 568, touch: true });
  await page.screenshot({ path: join(OUT, 'rows-heavy-320-touch.png'), fullPage: true });
  // Amount fully visible: the amount element is not clipped by its own box.
  const clipped = await page.$$eval('.transaction-row__amount', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  check('row amounts are not truncated at 320px', clipped.length === 0, clipped.join(', '));
  const visibleButtons = await page.$$eval('.action-row__more, .swipeable-row__action', (els) =>
    els.filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label')));
  check('touch: a visible control exists for duplicate (not long-press only)',
    visibleButtons.some((l) => /aktionen|duplic/i.test(l ?? '')), `visible: ${[...new Set(visibleButtons)].join(' | ')}`);

  // A vertical drag that starts on a row must not open it.
  const box = await page.locator('.action-row__content, .swipeable-row__content').first().boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const x = box.x + box.width / 3;
  const y = box.y + box.height / 2;
  await touch('touchStart', x, y);
  for (let i = 1; i <= 6; i++) await touch('touchMove', x, y - i * 7);
  await touch('touchEnd', x, y - 42);
  await page.waitForTimeout(250);
  check('touch: a scroll gesture starting on a row does not edit it', !(await qaLog(page)).some((l) => l.startsWith('edit')), (await qaLog(page)).join(', '));

  // Long press: must not silently duplicate; it should open the actions menu.
  await touch('touchStart', x, y);
  await page.waitForTimeout(700);
  await touch('touchEnd', x, y);
  await page.waitForTimeout(250);
  const afterPress = await qaLog(page);
  const menuOpen = await page.locator('[role="menu"]').count();
  check('touch: long press opens the actions menu instead of duplicating', menuOpen === 1 && !afterPress.some((l) => l.startsWith('duplicate')), `log=${afterPress.join(',')} menus=${menuOpen}`);
  if (menuOpen) await page.screenshot({ path: join(OUT, 'rows-menu-longpress-320.png') });
  await context.close();
}
{
  const { context, page } = await open({ section: 'rows', theme: 'light', data: 'typical', locale: 'en', currency: 'EUR' }, { width: 1440, height: 900 });
  await page.screenshot({ path: join(OUT, 'rows-typical-1440-light.png'), fullPage: true });
  // Keyboard: Tab to the first row, Enter edits.
  await page.keyboard.press('Tab');
  const role = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  check('keyboard: the row is announced as a button (was role=group)', role === 'button', `role=${role}`);
  await page.keyboard.press('Enter');
  check('keyboard: Enter on a row edits it', (await qaLog(page)).includes('edit 1'));
  // Tab to its actions button, open the menu, arrow, Escape returns focus.
  await page.keyboard.press('Tab');
  const hasPopup = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
  check('keyboard: the next tab stop is the row actions button', hasPopup === 'menu', `aria-haspopup=${hasPopup}`);
  if (hasPopup === 'menu') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const items = await page.locator('[role="menuitem"]').allTextContents();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    check('menu: lists edit, duplicate and delete with focus on the first item', items.length === 3 && focused === 'menuitem', items.join(' / '));
    await page.screenshot({ path: join(OUT, 'rows-menu-keyboard-1440-light.png') });
    await page.keyboard.press('ArrowDown');
    const second = await page.evaluate(() => document.activeElement?.textContent);
    check('menu: ArrowDown moves to duplicate', /duplicate/i.test(second ?? ''), second ?? '');
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
    check('menu: Escape closes and returns focus to the button', back === 'menu' && (await page.locator('[role="menu"]').count()) === 0);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('menu: choosing duplicate runs it', (await qaLog(page)).includes('duplicate 1'));
  }
  await context.close();
}

// ── 3. Period selector ──
{
  const { context, page } = await open({ section: 'period', theme: 'dark', locale: 'de' }, { width: 320, height: 568, touch: true });
  await page.locator('.period-select__trigger').tap();
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'period-open-320-de.png') });
  const listbox = await page.locator('[role="listbox"]').count();
  await page.touchscreen.tap(300, 540);
  await page.waitForTimeout(200);
  check('period: a tap outside closes the listbox on touch', listbox === 1 && (await page.locator('[role="listbox"]').count()) === 0);
  await context.close();
}

// ── 4. Category tiles ──
for (const theme of ['dark', 'light', 'lavender']) {
  const { context, page } = await open({ section: 'cats', theme, data: 'heavy', locale: 'de' }, { width: 320, height: 568, touch: true });
  await page.screenshot({ path: join(OUT, `cats-heavy-320-${theme}.png`) });
  const sel = await page.$eval('.add-txn__cat--selected', (e) => {
    const cs = getComputedStyle(e);
    return { border: cs.borderColor, bg: cs.backgroundColor };
  });
  const tokens = await page.evaluate(() => {
    const r = getComputedStyle(document.documentElement);
    return { income: r.getPropertyValue('--color-income').trim(), accent: r.getPropertyValue('--color-accent').trim() };
  });
  console.log(`      cats ${theme}: selected border=${sel.border} bg=${sel.bg} income=${tokens.income} accent=${tokens.accent}`);
  const names = await page.$$eval('.add-txn__cat-name', (els) => els.map((e) => e.textContent));
  const shown = await page.$$eval('.add-txn__cat-name', (els) => els.map((e) => getComputedStyle(e).textTransform));
  check(`cats (${theme}): names render as typed (no forced lowercase)`, shown.every((t) => t === 'none'), `${shown[0]}; e.g. ${names.find((n) => n === 'IKEA') ?? ''}`);
  await context.close();
}

// ── 5. Cash-flow chart ──
for (const [data, locale, currency, w] of [['heavy', 'de', 'CHF', 320], ['typical', 'en', 'EUR', 390], ['edge', 'en', 'USD', 320]]) {
  const { context, page } = await open({ section: 'chart', theme: 'dark', data, locale, currency }, { width: w, height: 700 });
  const plot = page.locator('.cashflow-chart__plot, .cashflow-chart').first();
  const sizes = await page.evaluate(() => {
    const svg = document.querySelector('.cashflow-chart__svg');
    const wrap = document.querySelector('.cashflow-chart');
    const text = svg?.querySelector('text');
    return {
      svgW: svg?.getBoundingClientRect().width, wrapW: wrap?.clientWidth, scrollW: wrap?.scrollWidth,
      fontPx: text ? text.getBoundingClientRect().height : 0,
      axis: [...(svg?.querySelectorAll('text') ?? [])].map((t) => t.textContent),
    };
  });
  check(`chart ${data}@${w}: fits without sideways scroll`, (sizes.scrollW ?? 0) <= (sizes.wrapW ?? 0) + 1, `svg=${sizes.svgW} wrap=${sizes.wrapW} scroll=${sizes.scrollW}`);
  console.log(`      chart ${data}@${w} axis/x labels: ${sizes.axis.join(' | ')}  (label box ${sizes.fontPx.toFixed(1)}px)`);
  // Keyboard exploration
  await page.keyboard.press('Tab');
  const focusedIsPlot = await page.evaluate(() => document.activeElement?.classList.contains('cashflow-chart__plot') ?? false);
  check(`chart ${data}@${w}: reachable by keyboard`, focusedIsPlot);
  if (focusedIsPlot) {
    await page.keyboard.press('Home');
    await page.waitForTimeout(80);
    const first = await page.locator('.cashflow-tooltip').textContent();
    await page.keyboard.press('End');
    await page.waitForTimeout(80);
    const last = await page.locator('.cashflow-tooltip').textContent();
    check(`chart ${data}@${w}: Home/End read exact values`, Boolean(first && last), `${first} … ${last}`);
  }
  // Tooltip inside the viewport at both ends (pointer).
  const pb = await plot.boundingBox();
  for (const fx of [0.02, 0.98]) {
    await page.mouse.move(pb.x + pb.width * fx, pb.y + pb.height / 2);
    await page.waitForTimeout(80);
    const tb = (await page.locator('.cashflow-tooltip').count()) ? await page.locator('.cashflow-tooltip').boundingBox() : null;
    const inside = tb && tb.x >= 0 && tb.x + tb.width <= w;
    check(`chart ${data}@${w}: tooltip stays on screen at ${fx < 0.5 ? 'left' : 'right'} edge`, Boolean(inside), tb ? `x=${tb.x.toFixed(0)} w=${tb.width.toFixed(0)} vw=${w}` : 'no tooltip');
    if (fx > 0.5) await page.screenshot({ path: join(OUT, `chart-${data}-${w}-tooltip-right.png`) });
  }
  const table = await page.locator('details.cashflow-table').count();
  check(`chart ${data}@${w}: exact values available as a table`, table === 1);
  if (table) {
    await page.locator('details.cashflow-table summary').click();
    await page.screenshot({ path: join(OUT, `chart-${data}-${w}-table.png`), fullPage: true });
  }
  await context.close();
}

// ── 6a. Primary summary amounts are never ellipsised ──
for (const [w, h] of [[320, 568], [1440, 900]]) {
  const { context, page } = await open({ section: 'donut', theme: 'dark', data: 'heavy', locale: 'de', currency: 'CHF' }, { width: w, height: h });
  const c = await page.$eval('.donut-center__value', (e) => ({ text: e.textContent, clipped: e.scrollWidth > e.clientWidth + 1 }));
  check(`donut centre total fully visible at ${w}px`, !c.clipped, c.text ?? '');
  await context.close();
}

// ── 6. Donut colours follow a live theme switch ──
{
  const { context, page } = await open({ section: 'donut', theme: 'dark', data: 'typical' }, { width: 390, height: 844 });
  const stops = () => page.$$eval('.donut linearGradient stop:nth-child(2)', (els) => els.map((e) => e.getAttribute('stop-color')));
  const dots = () => page.$$eval('.insights-category-card__dot', (els) => els.map((e) => getComputedStyle(e).getPropertyValue('--dot-color').trim()));
  const darkStops = await stops();
  const darkDots = await dots();
  await page.screenshot({ path: join(OUT, 'donut-dark.png'), fullPage: true });
  await page.evaluate(() => window.__qa.setTheme('light'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'donut-dark-then-light.png'), fullPage: true });
  const lightStops = await stops();
  const lightDots = await dots();
  const fresh = await open({ section: 'donut', theme: 'light', data: 'typical' }, { width: 390, height: 844 });
  const freshStops = await fresh.page.$$eval('.donut linearGradient stop:nth-child(2)', (els) => els.map((e) => e.getAttribute('stop-color')));
  await fresh.page.screenshot({ path: join(OUT, 'donut-light-fresh.png'), fullPage: true });
  await fresh.context.close();
  check('donut: live dark→light switch matches a fresh light load', JSON.stringify(lightStops) === JSON.stringify(freshStops),
    `dark=${darkStops.slice(0, 2)} switched=${lightStops.slice(0, 2)} fresh=${freshStops.slice(0, 2)}; other dot ${darkDots.at(-1)}→${lightDots.at(-1)}`);
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (${label})`);
