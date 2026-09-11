import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { summarize, verifyAppCheckToken } from './index.js';

test('receiver independently drops sensitive context and redacts message data', () => {
  const entry = summarize({
    source: 'manual',
    error: { message: 'alice@example.com Bearer abc.def.ghi password=hunter2' },
    context: { operation: 'save', amount: 42, note: 'rent', uid: 'user-1' },
  });
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /alice@example\.com|hunter2|rent|user-1|"amount"/);
  assert.equal(entry.context.operation, 'save');
});

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function signedToken(privateKey, kid, claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

test('App Check verification rejects forged claims and accepts a valid signed token', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const now = 2_000_000_000;
  const base = {
    iss: 'https://firebaseappcheck.googleapis.com/123456',
    aud: ['projects/123456'],
    sub: '1:123456:web:allowed',
    iat: now - 5,
    exp: now + 3600,
  };
  const fetchJwks = async () => Response.json({ keys: [{ ...jwk, kid: 'test_key' }] });
  const env = { FIREBASE_PROJECT_NUMBER: '123456', FIREBASE_APP_IDS: base.sub };

  assert.equal(await verifyAppCheckToken(
    await signedToken(keys.privateKey, 'test_key', base), env, fetchJwks, now,
  ), true);
  assert.equal(await verifyAppCheckToken(
    await signedToken(keys.privateKey, 'test_key', { ...base, aud: ['projects/attacker'] }), env, fetchJwks, now,
  ), false);
  assert.equal(await verifyAppCheckToken(
    await signedToken(keys.privateKey, 'test_key', { ...base, exp: now }), env, fetchJwks, now,
  ), false);
});

test('POST fails closed before reading telemetry when App Check is missing', async () => {
  const request = new Request('https://errors.example.test', {
    method: 'POST',
    headers: { Origin: 'https://aus01.web.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: { message: 'must not log' } }),
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGINS: 'https://aus01.web.app',
    FIREBASE_PROJECT_NUMBER: '123456',
    FIREBASE_APP_IDS: '1:123456:web:allowed',
  }, {});
  assert.equal(response.status, 401);
});
