/**
 * Captures the README web screenshots against the local emulators, so the images
 * show seeded demo data rather than anyone's real finances.
 *
 * Prerequisites:
 *   npx firebase emulators:start --only auth,firestore --project demo-ausgegeben
 *   node scripts/seed-demo-data.mjs
 *   npx vite --mode emulator --port 5173
 *
 * Then:
 *   node scripts/capture-screenshots.mjs
 *
 * 1280x880 at deviceScaleFactor 2 reproduces the existing 2560x1760 images.
 * Theme comes from colorScheme because the seeded preference is themeMode:
 * 'system', which the app resolves through prefers-color-scheme.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'docs', 'screenshots', 'web');
const BASE = 'http://localhost:5173';
const EMAIL = 'demo@ausgegeben.app';
const PASSWORD = 'demo-password-123';

mkdirSync(OUT_DIR, { recursive: true });

async function signIn(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  // The record list only renders once the seeded transactions arrive.
  await page.getByText('Weekly groceries').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function capture(page, name, scheme) {
  const file = join(OUT_DIR, `${name}-${scheme}.png`);
  await page.screenshot({ path: file });
  console.log(`  wrote ${name}-${scheme}.png`);
}

async function run(scheme) {
  console.log(`[${scheme}]`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 880 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    locale: 'en-DE',
  });
  const page = await context.newPage();

  await signIn(page);
  await capture(page, 'web-record', scheme);

  await page.getByRole('button', { name: 'insights', exact: true }).first().click();
  await page.waitForTimeout(2000); // donut + cash-flow chart animate in
  await capture(page, 'web-insights', scheme);

  await page.getByRole('button', { name: 'settings', exact: true }).first().click();
  await page.waitForTimeout(1200);
  await capture(page, 'web-settings', scheme);

  await page.getByRole('button', { name: 'record', exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'add transaction', exact: true }).first().click();
  await page.waitForTimeout(1200);
  await capture(page, 'web-add-transaction', scheme);

  await browser.close();
}

await run('light');
await run('dark');
console.log('done');
