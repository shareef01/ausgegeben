/**
 * Captures the README Android screenshots against the local emulators, so the
 * images show seeded demo data rather than anyone's real finances. Web parity:
 * web/scripts/capture-screenshots.mjs.
 *
 * Prerequisites:
 *   npx firebase emulators:start --only auth,firestore --project demo-ausgegeben
 *   # seed under the project id in app/google-services.json, not the web one
 *   PROJECT_ID=<google-services project_id> node web/scripts/seed-demo-data.mjs
 *   ./gradlew assembleProdDebug
 *   # an AVD running, already signed in as demo@ausgegeben.app
 *
 * Then:
 *   node scripts/capture-android-screenshots.mjs
 *
 * Targets an emulator only. A serial is taken from ANDROID_SERIAL when set,
 * otherwise the single attached emulator-* device — a physical phone plugged in
 * for development must never be installed onto or have its data seeded.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'screenshots', 'android');
const APK = join(ROOT, 'app', 'build', 'outputs', 'apk', 'prod', 'debug', 'app-prod-debug.apk');
const PACKAGE = 'com.aus.ausgegeben';

const ADB = process.env.ADB_PATH
  ?? join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '', 'Android', 'Sdk', 'platform-tools', 'adb');

function adb(args, opts = {}) {
  return execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8', ...opts });
}

function resolveSerial() {
  if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL;
  const lines = execFileSync(ADB, ['devices'], { encoding: 'utf8' })
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
  const emulators = lines
    .filter((l) => l.endsWith('\tdevice'))
    .map((l) => l.split('\t')[0])
    .filter((s) => s.startsWith('emulator-'));
  if (emulators.length === 0) {
    throw new Error('No running emulator found. Start an AVD, or set ANDROID_SERIAL.');
  }
  if (emulators.length > 1) {
    throw new Error(`Multiple emulators (${emulators.join(', ')}). Set ANDROID_SERIAL.`);
  }
  return emulators[0];
}

const serial = resolveSerial();
if (!serial.startsWith('emulator-') && !process.env.ALLOW_PHYSICAL_DEVICE) {
  throw new Error(
    `Refusing to target ${serial}: it is not an emulator. These screenshots install a debug ` +
      'build and drive the UI, which should never touch a real phone. Set ALLOW_PHYSICAL_DEVICE=1 to override.',
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Bottom-nav tap targets, as a fraction of screen size — resolution-independent
 * so a differently sized AVD still lands on the right tab.
 */
const TABS = { record: 0.18, insights: 0.5, settings: 0.82 };
const NAV_Y = 0.938;

function screenSize() {
  const out = adb(['shell', 'wm', 'size']);
  const m = out.match(/(\d+)x(\d+)/);
  if (!m) throw new Error(`Could not parse screen size from: ${out}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

async function capture(name, scheme) {
  const png = execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const file = join(OUT_DIR, `${name}-${scheme}.png`);
  writeFileSync(file, png);
  console.log(`  wrote ${name}-${scheme}.png`);
}

async function run(scheme) {
  console.log(`[${scheme}]`);
  adb(['shell', 'cmd', 'uimode', 'night', scheme === 'dark' ? 'yes' : 'no']);
  await sleep(6000);

  const { width, height } = screenSize();
  const y = Math.round(height * NAV_Y);
  // "bills" is the historical file name for what the app calls Insights.
  for (const [tab, file, settle] of [
    ['record', 'record', 4000],
    ['insights', 'bills', 6000],
    ['settings', 'settings', 5000],
  ]) {
    adb(['shell', 'input', 'tap', String(Math.round(width * TABS[tab])), String(y)]);
    await sleep(settle);
    await capture(file, scheme);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`device: ${serial}`);

adb(['install', '-r', '-t', APK], { stdio: 'inherit' });
// Read before Firebase initializes, so it has to be set before the app starts.
adb(['shell', 'setprop', 'debug.ausgegeben.fb_emulators', '1']);
adb(['shell', 'am', 'force-stop', PACKAGE]);
adb(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`], { stdio: 'ignore' });
await sleep(12000);

// Animations skew timing-based captures; restored below so the AVD is left usable.
for (const scale of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
  adb(['shell', 'settings', 'put', 'global', scale, '0']);
}
try {
  await run('light');
  await run('dark');
} finally {
  adb(['shell', 'cmd', 'uimode', 'night', 'no']);
  for (const scale of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    adb(['shell', 'settings', 'put', 'global', scale, '1']);
  }
}
console.log('done');
