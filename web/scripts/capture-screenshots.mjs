/**
 * Capture the README screenshots from the local Firebase demo account.
 * Start the emulators, run seed-demo-data.mjs and serve Vite in emulator mode.
 * Pass --full for the phone, tablet and desktop QA captures. SCREENSHOT_DIR
 * overrides the output folder and PW_CHROMIUM selects an installed browser.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const full = process.argv.includes('--full');
const OUT_DIR = process.env.SCREENSHOT_DIR ?? join(__dirname, '..', '..',
  ...(full ? ['.artifacts', 'ui-overhaul', 'after'] : ['docs', 'screenshots', 'web']));
const BASE = process.env.BASE ?? 'http://localhost:5173';
const EMAIL = 'demo@ausgegeben.app';
const PASSWORD = 'demo-password-123';

mkdirSync(OUT_DIR, { recursive: true });

async function selectTab(page, name) {
  await page.getByRole('button', { name, exact: true }).first().click();
}

async function run(browser, { width, height, colorScheme, theme, label }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: full ? 1 : 2,
    colorScheme,
    reducedMotion: 'reduce',
    locale: 'en-DE',
  });
  try {
    const page = await context.newPage();
    const capture = async (name, target = page, options = {}) => {
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const file = join(OUT_DIR, full ? `${label}-${name}.png` : `web-${name}-${colorScheme}.png`);
      await target.screenshot({ path: file, animations: 'disabled', ...options });
      console.log(`wrote ${file}`);
    };

    await page.goto(BASE);
    const email = page.locator('#auth-email');
    await email.waitFor();
    if (full) {
      await capture('auth');
      await page.locator('.auth-page__forgot').click();
      await page.locator('.auth-page__error').waitFor();
      await capture('auth-error');
    }
    await email.fill(EMAIL);
    await page.locator('#auth-password').fill(PASSWORD);
    const submit = page.locator('form button[type="submit"]');
    if (full) {
      let releaseLoading;
      const ready = new Promise((resolve) => { releaseLoading = resolve; });
      await page.route('**/src/views/SignedInApp.tsx', async (route) => {
        await ready;
        await route.continue();
      });
      try {
        await submit.click();
        await page.locator('.loading-screen').waitFor();
        await capture('loading');
      } finally {
        releaseLoading();
      }
    } else {
      await submit.click();
    }
    const row = page.getByText('Weekly groceries', { exact: true }).first();
    await row.waitFor({ timeout: 30_000 });

    if (theme) {
      await page.evaluate(async (mode) => {
        const { usePreferencesStore } = await import('/src/services/preferencesStore.ts');
        usePreferencesStore.getState().setThemeMode(mode);
      }, theme);
      await page.locator(`html[data-theme-name="${theme}"]`).waitFor({ state: 'attached' });
    }
    await capture('record');

    if (full) {
      await page.locator('.fab-add:visible').click();
      await page.locator('#txn-amount').waitFor();
      await capture('add');
      await page.locator('#txn-amount').fill('42.50');
      await page.keyboard.press('Escape');
      await page.getByRole('alertdialog').waitFor();
      await capture('confirm');
      await page.getByRole('alertdialog').getByRole('button', { name: 'discard', exact: true }).click();
      await row.click();
      await page.locator('#txn-note').waitFor();
      await capture('edit');
      await page.keyboard.press('Escape');
    }

    await selectTab(page, 'insights');
    await page.locator('.insights-category-card').first().waitFor();
    await capture('insights');

    if (full) {
      await selectTab(page, 'settings');
      await page.locator('.settings-account').waitFor();
      await capture('settings', page, { fullPage: true });
      const budgets = page.locator('.category-budgets:visible');
      await budgets.evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await capture('budgets', budgets);
      await page.getByRole('button', { name: /category management/i }).click();
      await page.locator('#categories-title').waitFor();
      await capture('categories');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /recurring transactions/i }).click();
      await page.locator('.recurring-panel').waitFor();
      await page.locator('.recurring-panel__new:enabled').waitFor();
      await capture('recurring');
      await page.locator('.recurring-panel__new').click();
      await page.locator('#recurring-editor-title').waitFor();
      await capture('recurring-editor');
    }
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  const variants = full ? [
    { width: 1600, height: 1000, colorScheme: 'light', theme: 'light', label: '1600-light' },
    { width: 390, height: 844, colorScheme: 'dark', theme: 'dark', label: '390-dark' },
    { width: 834, height: 1000, colorScheme: 'light', theme: 'light', label: '834-light' },
    { width: 390, height: 844, colorScheme: 'dark', theme: 'amoled', label: '390-amoled' },
    { width: 834, height: 1000, colorScheme: 'light', theme: 'lavender', label: '834-lavender' },
  ] : ['light', 'dark'].map((colorScheme) => ({ width: 1600, height: 1000, colorScheme }));
  for (const variant of variants) await run(browser, variant);
} finally {
  await browser.close();
}
