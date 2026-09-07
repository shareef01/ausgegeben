import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnv, validateProductionEnv } from './prod-env.mjs';

const complete = Object.fromEntries([
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_APP_CHECK_KEY',
].map((key) => [key, `valid-${key}`]));

test('complete production config passes without requiring optional diagnostics', () => {
  assert.deepEqual(validateProductionEnv(complete), []);
});

test('missing and placeholder values fail closed', () => {
  const invalid = { ...complete, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_APP_ID: 'YOUR_APP_ID' };
  assert.deepEqual(validateProductionEnv(invalid), ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID']);
});

test('dotenv parser handles comments and quoted values', () => {
  assert.deepEqual(parseEnv('# comment\nA="one"\nB=two\n'), { A: 'one', B: 'two' });
});
