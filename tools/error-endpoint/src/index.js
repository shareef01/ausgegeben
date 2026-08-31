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
  async fetch(request, env) {
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
