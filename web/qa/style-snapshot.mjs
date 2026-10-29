/**
 * Computed-style snapshot of the real app, for proving a CSS refactor changes nothing.
 *
 *   (emulators + `node scripts/seed-demo-data.mjs` + `node scripts/seed-qa-data.mjs`)
 *   npx vite --mode emulator --port 5173
 *   node qa/style-snapshot.mjs before          # writes ../docs/design-qa/css/before.json + PNGs
 *   ... change CSS ...
 *   node qa/style-snapshot.mjs after
 *   node qa/style-snapshot.mjs diff            # every element/property that differs
 *
 * Each element (and its ::before/::after) is keyed by its DOM path; its full computed style
 * is hashed, with the strings kept once in a shared table so a diff can name the property.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode = 'before'] = process.argv.slice(2);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', 'css');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5173';

if (mode === 'diff') {
  const a = JSON.parse(readFileSync(join(OUT, 'before.json'), 'utf8'));
  const b = JSON.parse(readFileSync(join(OUT, 'after.json'), 'utf8'));
  // Canonicalise each style (sorted keys) so snapshots taken before the serializer sorted
  // still compare correctly.
  const canon = (t) => {
    const memo = new Map();
    return (h) => {
      if (!memo.has(h)) {
        const o = JSON.parse(t[h]);
        memo.set(h, JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))));
      }
      return memo.get(h);
    };
  };
  const ca = canon(a.table);
  const cb = canon(b.table);
  let diffs = 0;
  for (const state of Object.keys(a.states)) {
    const sa = Object.fromEntries(Object.entries(a.states[state]).map(([k, h]) => [k, ca(h)]));
    const sb = b.states[state] && Object.fromEntries(Object.entries(b.states[state]).map(([k, h]) => [k, cb(h)]));
    if (!sb) { console.log(`MISSING STATE ${state}`); diffs++; continue; }
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    for (const k of keys) {
      if (sa[k] === sb[k]) continue;
      diffs++;
      if (diffs > 60) continue;
      if (!sa[k] || !sb[k]) { console.log(`${state}  ${k}  element ${sa[k] ? 'removed' : 'added'}`); continue; }
      const pa = JSON.parse(sa[k]);
      const pb = JSON.parse(sb[k]);
      const props = Object.keys(pa).filter((p) => pa[p] !== pb[p]);
      console.log(`${state}  ${k}\n    ${props.slice(0, 6).map((p) => `${p}: ${pa[p]} → ${pb[p]}`).join('\n    ')}`);
    }
  }
  const states = Object.keys(a.states).length;
  const elements = Object.values(a.states).reduce((n, s) => n + Object.keys(s).length, 0);
  console.log(`\n${diffs === 0 ? 'IDENTICAL' : `${diffs} DIFFERENCES`} — ${states} states, ${elements} element styles compared`);
  process.exit(diffs === 0 ? 0 : 1);
}

const table = {};
const states = {};

async function snapshot(page, name) {
  await page.waitForTimeout(450);
  const raw = await page.evaluate(() => {
    const path = (el) => {
      const parts = [];
      for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
        const sibs = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
        parts.unshift(`${e.tagName.toLowerCase()}${sibs.length > 1 ? `:${sibs.indexOf(e) + 1}` : ''}`);
      }
      return parts.join('>');
    };
    // Sorted: Chrome does not keep custom properties in a stable order between loads.
    const ser = (cs) => {
      const names = [];
      for (let i = 0; i < cs.length; i++) names.push(cs[i]);
      names.sort();
      const o = {};
      for (const n of names) o[n] = cs.getPropertyValue(n);
      return JSON.stringify(o);
    };
    const out = {};
    for (const el of [document.documentElement, ...document.querySelectorAll('body, body *')]) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const p = path(el) || 'html';
      out[p] = ser(getComputedStyle(el));
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content && cs.content !== 'none' && cs.content !== 'normal') out[`${p}${pseudo}`] = ser(cs);
      }
    }
    return out;
  });
  const hashed = {};
  for (const [k, v] of Object.entries(raw)) {
    const h = createHash('sha1').update(v).digest('hex').slice(0, 16);
    table[h] = v;
    hashed[k] = h;
  }
  states[name] = hashed;
  console.log(`  ${name}: ${Object.keys(hashed).length} elements`);
}

const browser = await chromium.launch();

async function session(email, password, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark', hasTouch: width < 768, isMobile: width < 768 });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (email) {
    await page.locator('#auth-email').fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.locator('.transaction-row').first().waitFor({ timeout: 30000 });
  }
  return { context, page };
}

const setTheme = (page, mode) => page.evaluate(async (m) => {
  const path = '/src/services/preferencesStore.ts';
  const { usePreferencesStore } = await import(/* @vite-ignore */ path);
  usePreferencesStore.getState().setThemeMode(m);
}, mode);

const TAB_INDEX = { record: 0, insights: 1, settings: 2 };
const go = async (page, tab) => {
  // dispatchEvent, not click(): with the Insights overflow on main the phone dock is pushed
  // off-screen, and a positional click cannot reach it.
  await page.locator('.bottom-nav-pill__item, .app-header__nav-item').nth(TAB_INDEX[tab]).dispatchEvent('click');
  await page.waitForFunction((t) => new URL(location.href).searchParams.get('tab') === t || (t === 'record' && !new URL(location.href).searchParams.get('tab')), tab);
  await page.waitForTimeout(700);
};

const shot = (page, name) => page.screenshot({ path: join(OUT, `${mode}-${name}.png`), fullPage: false });

for (const [account, email] of [['demo', 'demo@ausgegeben.app'], ['heavy', 'qa-heavy@ausgegeben.test']]) {
  const password = account === 'demo' ? 'demo-password-123' : 'qa-password-123';
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const { context, page } = await session(email, password, w, h);
    for (const theme of ['dark', 'light', 'midnight', 'lavender']) {
      await setTheme(page, theme);
      const tag = `${account}-${w}-${theme}`;
      await go(page, 'record');
      await snapshot(page, `${tag}-record`);
      if (theme === 'dark' || theme === 'light') await shot(page, `${tag}-record`);
      await page.locator('.action-row__more').first().dispatchEvent('click');
      await snapshot(page, `${tag}-record-row-menu`);
      await page.keyboard.press('Escape');
      await page.locator('.period-select__trigger').first().dispatchEvent('click');
      await snapshot(page, `${tag}-record-period`);
      await page.keyboard.press('Escape');
      await go(page, 'insights');
      await snapshot(page, `${tag}-insights`);
      if (theme === 'dark' || theme === 'light') await shot(page, `${tag}-insights`);
      await go(page, 'settings');
      await snapshot(page, `${tag}-settings`);
      if (theme === 'dark' || theme === 'light') await shot(page, `${tag}-settings`);
      await go(page, 'record');
      await page.locator('.action-row__content').first().dispatchEvent('click');
      await page.getByRole('dialog').waitFor();
      await snapshot(page, `${tag}-edit-dialog`);
      if (theme === 'dark' || theme === 'light') await shot(page, `${tag}-edit-dialog`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    await setTheme(page, 'system');
    await context.close();
  }
}

for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { context, page } = await session(null, null, w, h);
  await snapshot(page, `signed-out-${w}`);
  await shot(page, `signed-out-${w}`);
  await context.close();
}

await browser.close();
writeFileSync(join(OUT, `${mode}.json`), JSON.stringify({ states, table }));
console.log(`wrote ${mode}.json: ${Object.keys(states).length} states, ${Object.keys(table).length} distinct styles`);
