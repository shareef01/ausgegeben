/**
 * Receives crash reports from the Ausgegeben PWA (web/src/services/errorSink.ts).
 *
 * Deliberately not a Cloud Function: the application remains on Firebase Spark, and
 * telemetry stays isolated from Firebase billing and storage in a small Worker.
 *
 * There is no database. Reports go to `console.*`, which surfaces in
 * `npx wrangler tail` live and in the Workers Logs tab of the Cloudflare
 * dashboard. That is the right size for an app whose entire crash volume should
 * be a handful of reports a week — add storage only if that stops being true.
 */

const MAX_BODY_BYTES = 16 * 1024;
const APP_CHECK_JWKS = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const JWKS_CACHE_SECONDS = 6 * 60 * 60;
let jwksCache = null;

function resetJwksCacheForTests() {
  jwksCache = null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Firebase-AppCheck',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function readJwks(fetcher, nowSeconds, forceRefresh = false) {
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > nowSeconds) return jwksCache.keys;
  const response = await fetcher(APP_CHECK_JWKS);
  if (!response.ok) throw new Error('jwks_fetch_failed');
  const body = await response.json();
  if (!body || !Array.isArray(body.keys)) throw new Error('jwks_invalid');
  jwksCache = { keys: body.keys, expiresAt: nowSeconds + JWKS_CACHE_SECONDS };
  return body.keys;
}

/** Verify Firebase App Check exactly as required for a custom backend. */
async function verifyAppCheckToken(token, env, fetcher = fetch, nowSeconds = Math.floor(Date.now() / 1000)) {
  const projectNumber = String(env.FIREBASE_PROJECT_NUMBER ?? '').trim();
  const allowedAppIds = String(env.FIREBASE_APP_IDS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!token || !projectNumber || allowedAppIds.length === 0) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') return false;
    if (claims.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) return false;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(`projects/${projectNumber}`)) return false;
    if (!allowedAppIds.includes(claims.sub)) return false;
    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) return false;
    if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60) return false;

    let jwks = await readJwks(fetcher, nowSeconds);
    let jwk = jwks.find((candidate) => candidate?.kid === header.kid);
    // Firebase can rotate signing keys before our six-hour cache expires. Refresh
    // once for an unknown kid, then fail closed; a forged token cannot trigger an
    // unbounded fetch loop.
    if (!jwk) {
      jwks = await readJwks(fetcher, nowSeconds, true);
      jwk = jwks.find((candidate) => candidate?.kid === header.kid);
    }
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * An open endpoint would let anyone fill the log with noise, so only the app's
 * own origins are accepted. This is not a security boundary — Origin is set by
 * the browser and a non-browser client can send anything — it just keeps casual
 * abuse and stray crawlers out of the logs.
 */
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin);
}

/**
 * Bound a field and strip control characters before it reaches a log line.
 *
 * `Origin` is not a security boundary (see isAllowedOrigin), so every field here is
 * attacker-controllable by anyone willing to set a header. `source` and `name` are
 * interpolated into the log message itself, so an unescaped newline in either forges
 * what looks like a separate, genuine log entry. Caps stop one report filling the log.
 *
 * Credential-shaped redaction only: it recognizes tokens/secrets/emails by their own
 * shape, not by content-sensitivity. This is NOT a PII or financial-data filter (see
 * the matching comment on the client's own redact() in errorSink.ts, which this is
 * functionally aligned with for the credential-shaped patterns both recognize — keep
 * the two regex sets in sync). It is NOT byte-for-byte identical: this function's
 * earlier control-character stripping (the line above these replaces) runs first and
 * turns an embedded newline into a space before the credential regex ever sees it, so
 * a secret followed by a real `\n` and more text is fully consumed here, while the
 * client's redact() (which has no equivalent forgery-prevention step) correctly stops
 * at the `\n`. That divergence is a side effect of a real, intentional log-forgery
 * protection this Worker needs and the client does not — it only makes this function
 * redact more of the surrounding text on that input, never less. See TEL-1.
 */
function logSafe(value, max) {
  return String(value ?? '')
    // Newlines, tabs and the rest of C0/C1 become spaces so nothing can break out of
    // its log line. Written with escapes rather than literal control bytes.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    // The final segment (signature) is optional: an unsigned/`alg:none` JWT has an
    // empty third segment, which `+` (one-or-more) previously failed to match. No
    // trailing \b either — see errorSink.ts's redact() for why that also silently
    // fails to match a trailing-dot JWT even once `*` allows the empty segment.
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]')
    // Consume to the next field separator (or end of string), not just to the next
    // space — see errorSink.ts's redact() for the exact bug this closes.
    .replace(/(password|refresh[_-]?token|access[_-]?token|authorization|cookie|secret)\s*[:=]\s*[^,;\n]+/gi, '$1=[REDACTED]')
    .slice(0, max);
}

function safeContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const key of ['during', 'operation', 'component', 'componentStack', 'filename', 'route']) {
    if (typeof raw[key] === 'string') out[key] = logSafe(raw[key], key === 'componentStack' ? 2000 : 256);
  }
  if (typeof raw.line === 'number' && Number.isFinite(raw.line)) out.line = raw.line;
  if (typeof raw.column === 'number' && Number.isFinite(raw.column)) out.column = raw.column;
  return Object.keys(out).length ? out : undefined;
}

/**
 * ISO timestamp, or null when the value is not a usable date.
 *
 * `new Date('x').toISOString()` throws RangeError, and `summarize` is not wrapped, so a
 * report with a malformed `at` took the whole request down with a 500 and was dropped.
 * The PWA always sends `Date.now()`, so this was only reachable by a crafted client —
 * but a 500 is the wrong answer to bad input either way.
 */
function isoOrNull(at) {
  if (at === null || at === undefined) return null;
  const ms = new Date(at).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const RATE_LIMIT = 20;
// A single source spread across many IPs (or many colos) can otherwise multiply past
// RATE_LIMIT — see the per-colo/non-atomic caveats below. This bounds the aggregate
// worst case for requests landing in any *one* colo, independent of how many distinct
// IPs contributed to it. Deliberately generous relative to RATE_LIMIT: this is a
// backstop against a flood, not a tight per-caller limit, so it should essentially
// never trigger for legitimate traffic (this app's entire crash volume is expected to
// be a handful of reports a week).
const GLOBAL_RATE_LIMIT = 300;
const RATE_WINDOW_SECONDS = 60;

/**
 * Increment-and-check a single Cache API counter. Returns true when `key` has not yet
 * reached `limit` for the current window, and durably records this call either way.
 *
 * Not atomic (see `withinRateLimit`'s own doc comment) — a burst of near-simultaneous
 * calls for the same key can each read the same `seen` value before any of their
 * writes land, undercounting by up to (burst size - 1). Fine for an abuse backstop;
 * would not be fine as the sole guard for something that needed an exact ceiling.
 */
async function checkAndIncrement(key, limit, ctx) {
  const window = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  // A synthetic GET is the documented way to key the Cache API by something other
  // than a real URL. The host is deliberately unroutable.
  const cacheKey = new Request(`https://ratelimit.invalid/${encodeURIComponent(key)}/${window}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  const seen = hit ? Number(await hit.text()) || 0 : 0;
  if (seen >= limit) return false;
  const write = cache.put(
    cacheKey,
    new Response(String(seen + 1), {
      headers: { 'Cache-Control': `max-age=${RATE_WINDOW_SECONDS}` },
    }),
  );
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
  else await write;
  return true;
}

/**
 * Per-IP (plus a global backstop) rate limit. Returns true when the request should
 * proceed.
 *
 * Two mechanisms, because the obvious one does not work here.
 *
 * `env.REPORT_LIMITER` is Cloudflare's built-in rate limiting binding, declared in
 * wrangler.toml. It binds, it is callable, and it returns `{ success: true }` — always.
 * Measured, not assumed: 80 POSTs in a burst from one IP against a configured limit of
 * 20/60s were all accepted, while a diagnostic build confirmed `limit()` was being
 * called and returning success with no error. `wrangler deploy` prints
 * "env.REPORT_LIMITER (20 requests/60s)" regardless. So three separate signals say the
 * limiter is live and it enforces nothing on this account. The call is kept because it
 * costs nothing and starts working if that ever changes — but it is not the mechanism.
 *
 * The counters below are. They use the Cache API, which is free, needs no binding, and
 * is the only durable-ish store available here: KV allows 1,000 writes a day on the
 * free plan and this would need one per request, and Durable Objects — which is what a
 * genuinely atomic, single global counter would require — are a paid feature this
 * Worker is deliberately built without (see the top-of-file comment: telemetry stays
 * isolated from Firebase billing, and equally from adding a paid Cloudflare
 * dependency). This is a documented, accepted trade-off, not an oversight.
 *
 * Two honest limits, confirmed by measurement, not just reasoned about: the cache is
 * per data centre, so 20 concurrent requests against two independent cache instances
 * (simulating two colos) each independently admitted their own 20 — 40 total for one
 * IP against a nominal cap of 20. And read-then-write is not atomic, so a burst of
 * genuinely simultaneous requests undercounts further still — measured at up to 2x
 * (40/40 accepted) against a mocked cache modelling realistic Cache API latency. No
 * exact global limit is being claimed here; do not read RATE_LIMIT/GLOBAL_RATE_LIMIT as
 * hard ceilings. The GLOBAL_RATE_LIMIT counter narrows, but does not eliminate, the
 * multi-IP/multi-colo gap: it caps the aggregate accepted in any one colo regardless of
 * how many distinct IPs contributed, so a flood spread across many IPs no longer scales
 * unboundedly with IP count within that colo. It does not — and cannot, without a
 * Durable Object — unify counting *across* colos.
 *
 * Counter failures fail closed. Losing telemetry during an edge-cache incident is
 * preferable to turning a known public endpoint into an unbounded log-ingestion path.
 */
async function withinRateLimit(request, env, ctx) {
  const limiter = env.REPORT_LIMITER;
  if (limiter && typeof limiter.limit === 'function') {
    try {
      // CF-Connecting-IP is set by Cloudflare's edge, not the caller, so unlike Origin
      // it cannot be spoofed.
      const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await limiter.limit({ key });
      if (!success) return false;
    } catch {
      // fall through to the counter
    }
  }

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await checkAndIncrement(ip, RATE_LIMIT, ctx))) return false;
    if (!(await checkAndIncrement('__global__', GLOBAL_RATE_LIMIT, ctx))) return false;
    return true;
  } catch {
    return false;
  }
}

function summarize(report) {
  const error = report?.error ?? {};
  return {
    source: logSafe(report?.source ?? 'unknown', 64),
    name: logSafe(error.name ?? 'unknown', 128),
    message: logSafe(error.message, 500),
    stack: logSafe(error.stack, 4000),
    // Objects are logged structurally rather than interpolated, so they cannot forge a
    // log line; the body cap is what bounds their size.
    context: safeContext(report?.context),
    url: logSafe(report?.url, 512),
    release: logSafe(report?.release, 64),
    userAgent: logSafe(report?.userAgent, 300),
    reportedAt: isoOrNull(report?.at),
  };
}

export { logSafe, resetJwksCacheForTests, safeContext, summarize, verifyAppCheckToken, withinRateLimit };

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    }

    if (!isAllowedOrigin(origin, env)) {
      return new Response('forbidden', { status: 403 });
    }

    const appCheckToken = request.headers.get('X-Firebase-AppCheck');
    if (!(await verifyAppCheckToken(appCheckToken, env))) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders(origin) });
    }

    // Checked before the body is read: a limited caller should cost this Worker as
    // little as possible, which is the whole point of limiting it.
    if (!(await withinRateLimit(request, env, ctx))) {
      return new Response('too many requests', {
        status: 429,
        headers: { ...corsHeaders(origin), 'Retry-After': '60' },
      });
    }

    // Refuse on the declared size before buffering. request.text() reads the whole body
    // into the isolate first, so checking only afterwards let anyone force the worker to
    // hold megabytes it was always going to reject.
    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return new Response('payload too large', { status: 413, headers: corsHeaders(origin) });
    }

    const body = await request.text();
    // Byte length, not `.length`: that counts UTF-16 code units, and multibyte
    // content (CJK stacks, emoji) encodes to more bytes than units, so the cap
    // would otherwise over-admit.
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return new Response('payload too large', { status: 413, headers: corsHeaders(origin) });
    }

    let report;
    try {
      report = JSON.parse(body);
    } catch {
      return new Response('invalid json', { status: 400, headers: corsHeaders(origin) });
    }

    const entry = summarize(report);
    // One line per report keeps `wrangler tail` readable; the object is expandable
    // in the dashboard.
    console.error(`[ausgegeben] ${entry.source}: ${entry.name}: ${entry.message}`, entry);

    // 204 with no body: the client is fire-and-forget and often mid-unload, so
    // there is nothing useful to say back to it.
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  },
};
