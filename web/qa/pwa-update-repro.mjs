/**
 * Controlled reproduction: what a service-worker update does to a tab that is already open.
 *
 *   node qa/pwa-update-repro.mjs
 *
 * Builds the app twice (Firebase unconfigured, two values of one env var, so the lazy chunks
 * get new hashes as in a real deploy), serves build A the way Firebase Hosting does (unknown
 * paths rewritten to index.html, nosniff), opens tab 1, "deploys" build B, opens tab 2 to
 * trigger the update check, then probes tab 1.
 *
 * Observed 2026-11-23 (Chromium): the new worker takes tab 1 over without reloading it
 * (skipWaiting + clientsClaim) and cleanupOutdatedCaches deletes build A's precache, so tab 1's
 * not-yet-loaded SettingsView chunk fails to import online and offline. That is the path
 * src/services/staleBuild.ts guards: warm the chunks early, and on a miss reload only once no
 * memory-only write is waiting for the server. Exit code 0 = the stranding reproduces AND a chunk warmed before the update survives it.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aus-pwa-'));
const blank = { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_APP_CHECK_KEY: '' };
for (const v of ['A', 'B']) {
  execSync(`npx vite build --mode repro --outDir "${path.join(work, v)}" --emptyOutDir`, {
    cwd: web, stdio: 'ignore', env: { ...process.env, ...blank, VITE_ERROR_REPORT_URL: `https://${v}.invalid` },
  });
}

let current = 'A';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let file = path.join(work, current, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(work, current, 'index.html');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4391, '127.0.0.1', r));
const origin = 'http://127.0.0.1:4391/';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext();
const tab1 = await ctx.newPage();
await tab1.goto(origin);
await tab1.evaluate(() => navigator.serviceWorker.ready);
await tab1.reload();
await tab1.evaluate(() => {
  window.__marker = 'tab-1-session';
  window.__ctl = 0;
  navigator.serviceWorker.addEventListener('controllerchange', () => { window.__ctl++; });
});
const chunk = fs.readdirSync(path.join(work, 'A', 'assets')).find((f) => f.startsWith('SettingsView-'));
const cached = () => tab1.evaluate(async (n) => {
  for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (r.url.includes(n)) return true;
  return false;
}, chunk);
const warmChunk = fs.readdirSync(path.join(work, 'A', 'assets')).find((f) => f.startsWith('InsightsView-'));
const tryImport = (name = chunk) => tab1.evaluate(async (u) => {
  try { await import(u); return 'loaded'; } catch (e) { return `FAILED: ${String(e.message).slice(0, 100)}`; }
}, `/assets/${name}`);

const before = await cached();
// What MainShell's idle preload does: evaluate a chunk while build A's precache is intact.
const warmedBeforeDeploy = await tryImport(warmChunk);
current = 'B';
const tab2 = await ctx.newPage();
await tab2.goto(origin);
await tab1.waitForFunction(() => window.__ctl > 0, null, { timeout: 20000 }).catch(() => {});
await tab1.waitForTimeout(1500);
const result = {
  chunk,
  precachedBeforeDeploy: before,
  controllerChanges: await tab1.evaluate(() => window.__ctl),
  tab1Reloaded: (await tab1.evaluate(() => window.__marker)) !== 'tab-1-session',
  precachedAfterUpdate: await cached(),
  importOnline: await tryImport(),
  warmedBeforeDeploy,
  warmedImportAfterUpdate: await tryImport(warmChunk),
};
await ctx.setOffline(true);
result.importOffline = await tryImport();
result.warmedImportOffline = await tryImport(warmChunk);
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
fs.rmSync(work, { recursive: true, force: true });
const stranded = result.controllerChanges > 0 && !result.tab1Reloaded && result.importOnline.startsWith('FAILED');
const warmSurvives = result.warmedImportAfterUpdate === 'loaded' && result.warmedImportOffline === 'loaded';
console.log(stranded ? 'REPRODUCED: an open tab is taken over and its unloaded chunks are gone' : 'NOT reproduced');
console.log(warmSurvives ? 'MITIGATION HOLDS: a chunk evaluated before the update still imports afterwards, offline too' : 'MITIGATION FAILED: a warmed chunk did not survive the update');
process.exit(stranded && warmSurvives ? 0 : 1);
