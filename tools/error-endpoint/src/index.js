/**
 * Receives crash reports from the Ausgegeben PWA (web/src/services/errorSink.ts).
 *
 * Deliberately not a Cloud Function: those need the Blaze plan and this project
 * stays on Spark. A Cloudflare Worker is free at this volume and needs no card.
 *
 * There is no database. Reports go to `console.*`, which surfaces in
 * `npx wrangler tail` live and in the Workers Logs tab of the Cloudflare
 * dashboard. That is the right size for an app whose entire crash volume should
 * be a handful of reports a week — add storage only if that stops being true.
 */

const MAX_BODY_BYTES = 16 * 1024;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
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
 */
function logSafe(value, max) {
  return String(value ?? '')
    // Newlines, tabs and the rest of C0/C1 become spaces so nothing can break out of
    // its log line. Written with escapes rather than literal control bytes.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .slice(0, max);
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
const RATE_WINDOW_SECONDS = 60;

/**
 * Per-IP rate limit. Returns true when the request should proceed.
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
 * The counter below is. It uses the Cache API, which is free, needs no binding, and is
 * the only durable-ish store available here: KV allows 1,000 writes a day on the free
 * plan and this would need one per request, and Durable Objects are paid.
 *
 * Two honest limits. The cache is per data centre, so a caller spread across regions
 * gets the limit per region. And read-then-write is not atomic, so a burst of exactly
 * simultaneous requests undercounts. Neither matters much for what this defends
 * against: one source flooding the log and burning the daily request allowance.
 *
 * **Fails open on purpose.** Any error here lets the report through. This endpoint
 * exists to make crashes visible, and silently dropping real reports because a
 * defence-in-depth counter hiccuped costs more than the noise it prevents. It is a
 * brake on abuse, not an authorisation check — there is nothing here to authorise and
 * no data to protect.
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
    const window = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
    // A synthetic GET is the documented way to key the Cache API by something other
    // than a real URL. The host is deliberately unroutable.
    const cacheKey = new Request(
      `https://ratelimit.invalid/${encodeURIComponent(ip)}/${window}`,
    );
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    const seen = hit ? Number(await hit.text()) || 0 : 0;
    if (seen >= RATE_LIMIT) return false;
    const write = cache.put(
      cacheKey,
      new Response(String(seen + 1), {
        headers: { 'Cache-Control': `max-age=${RATE_WINDOW_SECONDS}` },
      }),
    );
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
    else await write;
    return true;
  } catch {
    return true;
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
    context: report?.context,
    url: logSafe(report?.url, 512),
    release: logSafe(report?.release, 64),
    userAgent: logSafe(report?.userAgent, 300),
    reportedAt: isoOrNull(report?.at),
  };
}

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
