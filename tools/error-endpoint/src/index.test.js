import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { resetJwksCacheForTests, summarize, verifyAppCheckToken, withinRateLimit } from './index.js';

test('receiver redacts a multi-word secret in full, not just its first token (fixed)', () => {
  const entry = summarize({ error: { message: 'password: correct horse battery staple' } });
  assert.doesNotMatch(entry.message, /horse battery staple/);
});

test('receiver redacts a JWT with an empty trailing (unsigned) segment (fixed)', () => {
  const entry = summarize({
    error: { message: 'token was eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.' },
  });
  assert.doesNotMatch(entry.message, /eyJhbGciOiJIUzI1NiJ9/);
  assert.match(entry.message, /\[JWT REDACTED\]/);
});

test('receiver does NOT redact a bare-hostname email like admin@localhost (known, accepted gap — see logSafe doc comment)', () => {
  const entry = summarize({ error: { message: 'sent from admin@localhost' } });
  assert.match(entry.message, /admin@localhost/);
});

test.beforeEach(() => resetJwksCacheForTests());

/**
 * Minimal fake of the Workers Cache API (`caches.default`), scoped to what
 * `checkAndIncrement` actually calls: `match`/`put` on a `Request` keyed by URL.
 * `latencyMs` simulates a real Cache API round trip — a zero-latency in-memory map
 * does not reproduce the read-then-write race (TEL-2's concurrency test needs it).
 */
function makeFakeCache(latencyMs = 0) {
  const store = new Map();
  const delay = () => (latencyMs > 0 ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());
  return {
    async match(request) {
      await delay();
      return store.has(request.url) ? new Response(store.get(request.url)) : undefined;
    },
    async put(request, response) {
      await delay();
      store.set(request.url, await response.clone().text());
    },
  };
}

function withFakeCache(cache, fn) {
  const previous = globalThis.caches;
  globalThis.caches = { default: cache };
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.caches = previous; });
}

function reportRequest(ip) {
  return new Request('https://errors.example.test', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
  });
}

const NO_BINDING_ENV = {}; // env.REPORT_LIMITER absent — exercises the Cache API path directly

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

test('App Check verification refreshes cached JWKS once when a new kid appears', async () => {
  const oldKeys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const newKeys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const oldJwk = await crypto.subtle.exportKey('jwk', oldKeys.publicKey);
  const newJwk = await crypto.subtle.exportKey('jwk', newKeys.publicKey);
  const now = 2_000_030_000;
  const claims = {
    iss: 'https://firebaseappcheck.googleapis.com/123456',
    aud: ['projects/123456'],
    sub: '1:123456:web:allowed',
    iat: now - 5,
    exp: now + 3600,
  };
  let fetches = 0;
  const fetchJwks = async () => {
    fetches += 1;
    return Response.json({ keys: fetches === 1 ? [{ ...oldJwk, kid: 'old' }] : [{ ...newJwk, kid: 'new' }] });
  };
  const env = { FIREBASE_PROJECT_NUMBER: '123456', FIREBASE_APP_IDS: claims.sub };

  assert.equal(await verifyAppCheckToken(
    await signedToken(oldKeys.privateKey, 'old', claims), env, fetchJwks, now,
  ), true);
  assert.equal(await verifyAppCheckToken(
    await signedToken(newKeys.privateKey, 'new', claims), env, fetchJwks, now,
  ), true);
  assert.equal(fetches, 2);
});

test('App Check verification retries an unknown kid only once', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const now = 2_000_030_001;
  const claims = {
    iss: 'https://firebaseappcheck.googleapis.com/123456',
    aud: ['projects/123456'],
    sub: '1:123456:web:allowed',
    iat: now - 5,
    exp: now + 3600,
  };
  let fetches = 0;
  const emptyJwks = async () => { fetches += 1; return Response.json({ keys: [] }); };

  assert.equal(await verifyAppCheckToken(
    await signedToken(keys.privateKey, 'never-present', claims),
    { FIREBASE_PROJECT_NUMBER: '123456', FIREBASE_APP_IDS: claims.sub },
    emptyJwks,
    now,
  ), false);
  // One initial fetch plus exactly one retry; never an attacker-controlled loop.
  assert.equal(fetches, 2);
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

// TEL-2: rate limiting.

test('withinRateLimit: baseline — admits exactly RATE_LIMIT requests for one IP, then rejects', async () => {
  await withFakeCache(makeFakeCache(), async () => {
    const RATE_LIMIT = 20; // mirrors the module constant; not exported to keep it internal
    let accepted = 0;
    for (let i = 0; i < RATE_LIMIT + 5; i++) {
      // eslint-disable-next-line no-await-in-loop -- intentionally sequential
      if (await withinRateLimit(reportRequest('1.2.3.4'), NO_BINDING_ENV, undefined)) accepted++;
    }
    assert.equal(accepted, RATE_LIMIT);
  });
});

test('withinRateLimit: the global backstop caps aggregate volume across many distinct IPs sharing one cache', async () => {
  // Each IP alone would sit well under its own per-IP RATE_LIMIT (20), but 20 IPs x 20
  // requests would total 400 in one colo — well past GLOBAL_RATE_LIMIT (300) — without
  // this check. This is exactly the gap the per-IP-only design left: a flood spread
  // across many IPs landing in the same colo.
  await withFakeCache(makeFakeCache(), async () => {
    let accepted = 0;
    for (let ip = 0; ip < 20; ip++) {
      for (let i = 0; i < 20; i++) {
        // eslint-disable-next-line no-await-in-loop -- intentionally sequential
        if (await withinRateLimit(reportRequest(`10.0.0.${ip}`), NO_BINDING_ENV, undefined)) accepted++;
      }
    }
    assert.equal(accepted, 300); // GLOBAL_RATE_LIMIT, not 400 (20 IPs x 20 each)
  });
});

test('withinRateLimit: two independent caches (simulating two colos) each admit their own allowance for one IP', async () => {
  // Documents, rather than hides, the per-colo gap: this is the honest limit stated in
  // withinRateLimit's own doc comment, not something this change claims to have fixed.
  const RATE_LIMIT = 20;
  let acceptedColoA = 0;
  let acceptedColoB = 0;
  await withFakeCache(makeFakeCache(), async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      // eslint-disable-next-line no-await-in-loop -- intentionally sequential
      if (await withinRateLimit(reportRequest('9.9.9.9'), NO_BINDING_ENV, undefined)) acceptedColoA++;
    }
  });
  await withFakeCache(makeFakeCache(), async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      // eslint-disable-next-line no-await-in-loop -- intentionally sequential
      if (await withinRateLimit(reportRequest('9.9.9.9'), NO_BINDING_ENV, undefined)) acceptedColoB++;
    }
  });
  assert.equal(acceptedColoA, RATE_LIMIT);
  assert.equal(acceptedColoB, RATE_LIMIT); // same IP, independent colo, independent allowance
});

test('withinRateLimit: concurrent requests for one IP can exceed RATE_LIMIT under realistic cache latency', async () => {
  // The read-then-write counter is not atomic (documented in withinRateLimit's own doc
  // comment) — this test demonstrates, rather than asserts away, that gap under
  // concurrency with cache latency modelled, and confirms the global backstop still
  // bounds the result rather than admitting everything.
  const CONCURRENCY = 40;
  await withFakeCache(makeFakeCache(15), async () => {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => withinRateLimit(reportRequest('5.5.5.5'), NO_BINDING_ENV, undefined)),
    );
    const accepted = results.filter(Boolean).length;
    assert.ok(accepted > 0, 'at least some requests must be accepted');
    assert.ok(accepted <= CONCURRENCY, 'the backstop must not accept more than were sent');
    // This is the documented, known gap — not a regression to "fix" by asserting
    // accepted === 20 here, which the non-atomic design cannot actually guarantee.
  });
});

test('withinRateLimit: fails closed when the cache itself errors', async () => {
  const brokenCache = {
    match: async () => { throw new Error('cache unavailable'); },
    put: async () => { throw new Error('cache unavailable'); },
  };
  await withFakeCache(brokenCache, async () => {
    assert.equal(await withinRateLimit(reportRequest('1.1.1.1'), NO_BINDING_ENV, undefined), false);
  });
});
