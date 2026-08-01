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

function summarize(report) {
  const error = report?.error ?? {};
  return {
    source: report?.source ?? 'unknown',
    name: error.name ?? 'unknown',
    message: String(error.message ?? '').slice(0, 500),
    stack: String(error.stack ?? '').slice(0, 4000),
    context: report?.context,
    url: report?.url,
    release: report?.release,
    userAgent: String(report?.userAgent ?? '').slice(0, 300),
    reportedAt: report?.at ? new Date(report.at).toISOString() : null,
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

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
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
