import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_PRODUCTION_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_APP_CHECK_KEY',
];

export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

export function validateProductionEnv(values) {
  return REQUIRED_PRODUCTION_ENV.filter((key) => {
    const value = String(values[key] ?? '').trim();
    return !value || /YOUR_|CHANGEME|PLACEHOLDER/i.test(value);
  });
}

export function loadProductionEnv(cwd = process.cwd()) {
  const file = path.join(cwd, '.env.production');
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  return { ...fromFile, ...process.env };
}

export function validateBuiltBundle(values, cwd = process.cwd()) {
  const assets = path.join(cwd, 'dist', 'assets');
  if (!fs.existsSync(assets)) return ['dist/assets'];
  const bundle = fs.readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(assets, name), 'utf8'))
    .join('\n');
  return REQUIRED_PRODUCTION_ENV.filter((key) => !bundle.includes(String(values[key])));
}
