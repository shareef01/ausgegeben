/**
 * Responsive measurement sweep of the real app across the full viewport matrix
 * (phones → 2560px, the 767/768, 1023/1024 and 1439/1440 boundaries, short landscape), plus
 * one pixel either side of the phone-range rules at 380, 400, 430 and 520px.
 *
 *   emulators + `npx vite --mode emulator --port 5183` + `node scripts/seed-qa-data.mjs`
 *   node qa/responsive-audit.mjs <label> [base] [--shots] [--contrast-only]
 *
 * Per viewport × tab it reports measured facts, not impressions:
 *   - horizontal page overflow and the elements that cause it
 *   - nested scroll containers (a box whose content is taller than the box, inside the page)
 *   - focusable controls smaller than 24×24 CSS px (WCAG 2.5.8), and interactive text inputs
 *     under 16px on touch viewports (iOS focus-zoom)
 *   - truncated text in Insights category rows, and input placeholders cut without an ellipsis
 *   - on Record, whether keyboard focus order follows the visual column order
 * Exit code is the number of FAIL lines. Screenshots (with --shots) go to ../docs/design-qa/responsive/<label>/.
 * --themes adds a pass over every theme at 390px and 1440px (same measurements plus a shot each).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const shots = args.includes('--shots');
const themes = args.includes('--themes');
const contrastOnly = args.includes('--contrast-only');
const [label = 'now', base = 'http://127.0.0.1:5183'] = args.filter((a) => !a.startsWith('--'));
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design-qa', 'responsive', label);
if (shots) mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  [320, 568], [360, 640], [375, 667], [390, 844], [430, 932],
  // Phone-range rules: max-width 379px (ios/pages), min-width 400px (global/index),
  // min-width 430px (index), max-width 519/520px (pages). One pixel either side of each.
  [379, 800], [380, 800], [399, 800], [400, 800], [401, 800], [429, 900], [431, 900], [519, 900], [520, 900], [521, 900],
  [600, 900], [767, 1024], [768, 1024], [820, 1180], [834, 1180], [1023, 768], [1024, 768], [1024, 1366],
  [1280, 800], [1366, 768], [1439, 900], [1440, 900], [1600, 1000], [1920, 1080], [2560, 1440],
  [844, 390], [932, 430], // phones in landscape (short height)
];
const TABS = ['record', 'insights', 'settings'];

let failed = 0;
const line = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};
const warn = (msg) => console.log(`WARN  ${msg}`);

// PW_CHROMIUM lets a machine whose cached browser build differs from this Playwright version reuse it.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function signedInPage(width, height, scheme) {
  const touch = width < 768 || height < 500;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#auth-email').fill('qa-heavy@ausgegeben.test');
  await page.locator('#auth-password').fill('qa-password-123');
  await page.locator('form button[type="submit"]').click();
  const skip = page.getByRole('button', { name: /skip|überspringen/i });
  await Promise.race([
    page.locator('.transaction-row').first().waitFor({ timeout: 30000 }),
    skip.waitFor({ timeout: 30000 }),
  ]);
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.locator('.transaction-row').first().waitFor({ timeout: 30000 });
  }
  return { context, page, touch };
}

/**
 * Poll the signed-in account's stored preferences (Firestore emulator, owner access) until
 * themeMode equals `mode`, for up to 10 s. Returns what was last read, so a reset that never
 * lands is reported instead of silently leaking into the next run.
 */
async function waitForStoredTheme(page, mode) {
  const uid = await page.evaluate(async () => {
    const mod = await import(/* @vite-ignore */ '/src/services/authStore.ts');
    return mod.useAuthStore.getState().user?.uid ?? null;
  });
  if (!uid) return { ok: false, stored: 'no signed-in user' };
  const project = process.env.PROJECT_ID ?? 'demo-ausgegeben';
  const url = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/users/${uid}/settings/preferences`;
  let stored = 'unread';
  for (let i = 0; i < 40; i++) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } }).catch(() => null);
    if (res?.ok) stored = (await res.json()).fields?.themeMode?.stringValue ?? 'missing';
    else stored = `HTTP ${res?.status ?? 'unreachable'}`;
    if (stored === mode) return { ok: true, stored };
    await page.waitForTimeout(250);
  }
  return { ok: false, stored };
}

async function gotoTab(page, tab) {
  await page.evaluate((t) => {
    const u = new URL(location.href);
    u.searchParams.set('tab', t);
    history.pushState(null, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, tab);
  const ready = {
    record: '.transaction-row',
    insights: '.insights-category-card',
    settings: '.settings-account',
  }[tab];
  await page.locator(`.tab-panel--active ${ready}`).first().waitFor();
}

function measure(touch) {
  const vw = document.documentElement.clientWidth;
  const visible = (e) => {
    // [inert] covers inactive tab panels; aria-hidden alone is not skipped, because visible text
    // (e.g. category names whose row carries the accessible label) is often aria-hidden.
    if (e.closest('[inert],[hidden]')) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (e) => {
    const c = (e.className?.baseVal ?? e.className ?? '').toString().split(' ').filter(Boolean)[0];
    return c ? `.${c}` : e.tagName.toLowerCase();
  };
  const overflowers = [...document.querySelectorAll('body *')]
    .filter((e) => visible(e) && e.getBoundingClientRect().right > vw + 1)
    .filter((e) => !e.closest('.cashflow-table__scroll, .category-chip-rail, [data-scroll-x]'))
    .map((e) => `${name(e)}→${Math.round(e.getBoundingClientRect().right)}`);

  const nested = [...document.querySelectorAll('body *')]
    .filter((e) => {
      if (!visible(e)) return false;
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && e !== document.scrollingElement;
    })
    .map((e) => `${name(e)} (${e.clientHeight}/${e.scrollHeight}px)`);

  const small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=tab], [role=option], [role=radio]')]
    .filter((e) => visible(e) && !e.closest('.sr-only'))
    .filter((e) => {
      const r = e.getBoundingClientRect();
      if (e.matches('input[type=checkbox], input[type=radio]') && getComputedStyle(e).opacity === '0') return false;
      // A checkbox inside its <label> is hit through the whole label.
      const label = e.closest('label');
      if (label) {
        const lr = label.getBoundingClientRect();
        if (lr.width >= 24 && lr.height >= 24) return false;
      }
      return r.width < 24 || r.height < 24;
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return `${name(e)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    });

  const tinyInputs = touch
    ? [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')]
        .filter((e) => visible(e) && parseFloat(getComputedStyle(e).fontSize) < 16)
        .map((e) => `${name(e)} ${getComputedStyle(e).fontSize}`)
    : [];

  const clippedLabels = [...document.querySelectorAll('.segmented__label, .bottom-nav-pill__label')]
    .filter((e) => visible(e) && e.scrollWidth > e.clientWidth + 1)
    .map((e) => e.textContent);
  const truncated = [...document.querySelectorAll('.insights-category-card__name')]
    .filter((e) => visible(e) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)).length;
  const catNames = document.querySelectorAll('.insights-category-card__name').length;
  // Placeholders cannot be measured with scrollWidth: compare the text's width in the
  // input's font with the space inside its padding. Clipped text must end in an ellipsis.
  const cutPlaceholders = [...document.querySelectorAll('input[placeholder]')]
    .filter((e) => visible(e) && !e.value)
    .filter((e) => {
      const cs = getComputedStyle(e);
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return c.measureText(e.placeholder).width > room + 1 && cs.textOverflow !== 'ellipsis';
    })
    .map((e) => e.placeholder);
  const cardWidths = [...document.querySelectorAll('.insights-category-card')].filter(visible)
    .map((e) => Math.round(e.getBoundingClientRect().width));

  return {
    sw: document.documentElement.scrollWidth, vw,
    overflowers: [...new Set(overflowers)].slice(0, 5),
    nested: [...new Set(nested)].slice(0, 5),
    small: [...new Set(small)].slice(0, 8),
    tinyInputs: [...new Set(tinyInputs)],
    truncated, catNames, cardWidths, clippedLabels, cutPlaceholders,
  };
}

/** Tab through Record and check the visited regions advance left→right / top→bottom visually. */
async function recordFocusOrder(page) {
  await page.evaluate(() => document.querySelector('#app-main')?.focus());
  const seen = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      const region = a?.closest('.widget-stack') ? 'summary'
        : a?.closest('.record-filters') ? 'filters'
          : a?.closest('.content-col') ? 'list' : null;
      return region ? { region, x: Math.round(a.getBoundingClientRect().left) } : null;
    });
    if (r && seen.at(-1)?.region !== r.region) seen.push(r);
    if (r?.region === 'list') break;
  }
  return seen;
}

for (const scheme of contrastOnly ? [] : ['dark', 'light']) {
  for (const [w, h] of VIEWPORTS) {
    if (scheme === 'light' && ![320, 768, 1024, 1440, 1920].includes(w)) continue;
    const { context, page, touch } = await signedInPage(w, h, scheme);
    for (const tab of TABS) {
      await gotoTab(page, tab);
      if (tab === 'record') {
        const toggle = page.locator('.record-filters-toggle--icon[aria-expanded="false"]');
        if (await toggle.isVisible().catch(() => false)) await toggle.click();
      }
      const m = await page.evaluate(measure, touch);
      const at = `${tab} @${w}×${h} ${scheme}`;
      line(m.sw <= m.vw, `no horizontal overflow — ${at}${m.overflowers.length ? `: ${m.overflowers.join(', ')}` : ''}`);
      line(m.nested.length === 0, `no nested vertical scroll — ${at}${m.nested.length ? `: ${m.nested.join(', ')}` : ''}`);
      line(m.small.length === 0, `targets ≥24px — ${at}${m.small.length ? `: ${m.small.join(', ')}` : ''}`);
      line(m.clippedLabels.length === 0, `control labels not clipped — ${at}${m.clippedLabels.length ? `: ${m.clippedLabels.join(', ')}` : ''}`);
      line(m.cutPlaceholders.length === 0, `placeholders fit or end in an ellipsis — ${at}${m.cutPlaceholders.length ? `: ${m.cutPlaceholders.join(', ')}` : ''}`);
      if (touch) line(m.tinyInputs.length === 0, `inputs ≥16px on touch — ${at}${m.tinyInputs.length ? `: ${m.tinyInputs.join(', ')}` : ''}`);
      if (tab === 'insights' && m.catNames) {
        const msg = `insights category names truncated ${m.truncated}/${m.catNames}, cards ${m.cardWidths.join('/')}px — ${at}`;
        if (m.truncated > 0) warn(msg); else console.log(`INFO  ${msg}`);
      }
      if (shots) await page.screenshot({ path: join(OUT, `${tab}-${scheme}-${w}x${h}.png`), fullPage: false });
    }
    if (scheme === 'dark' && w >= 768) {
      await gotoTab(page, 'record');
      const order = await recordFocusOrder(page);
      const xs = order.map((o) => o.x);
      const monotonic = xs.every((x, i) => i === 0 || x >= xs[i - 1] - 4 || order[i].region === 'list' && order[i - 1].region !== 'list' && w < 1440);
      line(monotonic, `Record focus order follows visual order @${w}: ${order.map((o) => `${o.region}@${o.x}`).join(' → ')}`);
    }
    await context.close();
  }
}

// Every theme at one phone and one desktop width: the same measurements, plus screenshots to
// compare. Themes are switched through the preferences store, as the Settings picker does.
if (themes) {
  const ALL_THEMES = ['light', 'dark', 'amoled', 'midnight', 'ocean', 'forest', 'sunset', 'lavender', 'soft_light'];
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { context, page, touch } = await signedInPage(w, h, 'dark');
    for (const theme of ALL_THEMES) {
      await page.evaluate(async (mode) => {
        const mod = await import(/* @vite-ignore */ '/src/services/preferencesStore.ts');
        mod.usePreferencesStore.getState().setThemeMode(mode);
      }, theme);
      for (const tab of TABS) {
        await gotoTab(page, tab);
        const m = await page.evaluate(measure, touch);
        const at = `${tab} @${w}×${h} theme=${theme}`;
        line(m.sw <= m.vw, `no horizontal overflow — ${at}${m.overflowers.length ? `: ${m.overflowers.join(', ')}` : ''}`);
        line(m.small.length === 0, `targets ≥24px — ${at}${m.small.length ? `: ${m.small.join(', ')}` : ''}`);
        if (shots) await page.screenshot({ path: join(OUT, `theme-${theme}-${tab}-${w}.png`), fullPage: false });
      }
    }
    // Leave the seeded (emulator-only) account on the system theme for the next run. The
    // store change reaches Firestore asynchronously; closing the context straight away
    // dropped that push and left the account on the last theme, so every later sweep
    // measured soft_light while labelling its shots light/dark. Wait for the stored document.
    await page.evaluate(async () => {
      const mod = await import(/* @vite-ignore */ '/src/services/preferencesStore.ts');
      mod.usePreferencesStore.getState().setThemeMode('system');
    });
    const reset = await waitForStoredTheme(page, 'system');
    line(reset.ok, `QA account theme reset to system @${w} (stored: ${reset.stored})`);
    await context.close();
  }
}

// Toast with a long message at the narrowest phone width.
if (!contrastOnly) {
  const { context, page } = await signedInPage(320, 568, 'dark');
  await page.evaluate(async () => {
    const mod = await import(/* @vite-ignore */ '/src/services/toastStore.ts');
    mod.useToastStore.getState().show('Die Transaktion konnte nicht gespeichert werden, weil die Verbindung unterbrochen wurde', 'wiederholen', () => {});
  });
  await page.locator('.toast-host').waitFor();
  const t = await page.evaluate(() => {
    const host = document.querySelector('.toast-host');
    if (!host) return null;
    const r = host.getBoundingClientRect();
    const text = host.querySelector('.toast-host__message') ?? host.querySelector('span');
    return { left: r.left, right: r.right, vw: innerWidth, clipped: text ? text.scrollWidth > text.clientWidth + 1 || text.getBoundingClientRect().right > r.right : false };
  });
  line(!!t && t.left >= 0 && t.right <= t.vw && !t.clipped, `long toast fits and wraps @320: ${JSON.stringify(t)}`);
  if (shots) await page.screenshot({ path: join(OUT, 'toast-long-320.png') });
  await context.close();
}

// Resolve rendered colors against the nearest composited CSS backgrounds.
{
  const { context, page } = await signedInPage(390, 844, 'dark');
  const samples = async (selectors) => page.evaluate((targets) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const luminance = () => {
      const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const paint = (color) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
    };
    return targets.map((selector) => {
      const element = document.querySelector(`.tab-panel--active ${selector}`);
      if (!element) return [selector, 0];
      const surfaces = [];
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        surfaces.unshift(getComputedStyle(ancestor).backgroundColor);
      }
      paint('#fff');
      surfaces.forEach(paint);
      const backdrop = luminance();
      paint(getComputedStyle(element).color);
      const ink = luminance();
      return [selector, (Math.max(ink, backdrop) + 0.05) / (Math.min(ink, backdrop) + 0.05)];
    });
  }, selectors);
  for (const theme of ['light', 'dark', 'amoled', 'midnight', 'ocean', 'forest', 'sunset', 'lavender', 'soft_light']) {
    await page.evaluate(async (mode) => {
      const { applyTheme, themePalettes } = await import('/src/theme/tokens.ts');
      applyTheme(themePalettes[mode]);
      document.documentElement.dataset.themeName = mode;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, theme);
    await page.locator(`html[data-theme-name="${theme}"]`).waitFor({ state: 'attached' });
    const measurements = [];
    for (const [tab, targets] of Object.entries({
      record: ['.finance-summary-card__eyebrow', '.budget-bar__status', '.budget-bar__spent--over', '.transaction-row__title'],
      insights: ['.insights-category-card__title', '.insights-category-card__total', '.insights-category-card__pct'],
      settings: ['.settings-account__badge'],
    })) {
      await gotoTab(page, tab);
      measurements.push(...await samples(targets));
    }
    line(measurements.every(([, ratio]) => ratio >= 4.5),
      `text contrast ${theme}: ${measurements.map(([selector, ratio]) => `${selector} ${ratio.toFixed(2)}:1`).join(', ')}`);
  }
  await context.close();
}

await browser.close();
console.log(`\n${failed} failing checks`);
process.exit(failed);
