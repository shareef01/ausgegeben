#!/usr/bin/env node
/**
 * Post-deploy smoke test for the live PWA.
 *
 * Exists because a deploy succeeding proves almost nothing. The web API key in
 * .env.production was silently deleted from the project at some point, and every
 * sign-in returned "API key expired" for an unknown length of time — through
 * multiple green CI runs and multiple successful deploys, because nothing
 * exercised the deployed artifact. This does.
 *
 * Deliberately dependency-free (no Playwright, no browser) so it can run in CI on
 * a schedule and finish in seconds. It cannot catch a render-time white screen —
 * that is what the error boundary is for — but it does catch the whole class of
 * "the site serves fine and nothing works".
 *
 *   node scripts/smoke.mjs [origin]
 *
 * Exits non-zero on the first hard failure.
 */

const ORIGIN = (process.argv[2] || 'https://aus01.web.app').replace(/\/$/, '');
// Configuration that is optional on a preview build is mandatory on the real site, so
// some checks are only hard failures here.
const PRODUCTION_ORIGINS = ['https://aus01.web.app'];
const IS_PRODUCTION = PRODUCTION_ORIGINS.includes(ORIGIN);
const results = [];
let hardFailures = 0;

function record(ok, name, detail = '', soft = false) {
  results.push({ ok, name, detail, soft });
  if (!ok && !soft) hardFailures++;
}

async function main() {
  // ── the page itself ──
  let html = '';
  let headers;
  try {
    const res = await fetch(ORIGIN + '/', { redirect: 'follow' });
    headers = res.headers;
    html = await res.text();
    record(res.ok, `GET / returns ${res.status}`);
  } catch (err) {
    record(false, 'GET / reachable', err.message);
    return;
  }
  record(/<div id="root">/.test(html), 'index.html contains the React mount point');

  // ── security headers, which only exist if firebase.json shipped ──
  const csp = headers.get('content-security-policy') || '';
  record(csp.length > 0, 'Content-Security-Policy header present');
  record(/frame-ancestors 'none'/.test(csp), "CSP sets frame-ancestors 'none'");
  record(
    Boolean(headers.get('strict-transport-security')),
    'Strict-Transport-Security header present',
  );

  // ── the JS bundle actually loads ──
  const bundleMatch = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  if (!bundleMatch) {
    record(false, 'entry bundle referenced in index.html');
    return;
  }
  const bundleUrl = ORIGIN + bundleMatch[0];
  const bundleRes = await fetch(bundleUrl);
  const bundle = await bundleRes.text();
  record(bundleRes.ok, `entry bundle serves ${bundleRes.status}`, bundleMatch[0]);

  // ── the Firebase key baked into that bundle is still alive ──
  // A read-only probe: no sign-in attempt, so this can run on a schedule without
  // piling up failed logins. A deleted or expired key answers API_KEY_INVALID,
  // which is exactly the failure that went unnoticed in production.
  const key = (bundle.match(/AIzaSy[A-Za-z0-9_-]{20,}/) || [])[0];
  if (!key) {
    record(false, 'Firebase API key found in bundle');
  } else {
    const probe = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects?key=${key}`,
      { headers: { Referer: ORIGIN + '/' } },
    );
    const body = await probe.json().catch(() => ({}));
    if (probe.ok) {
      record(true, 'Firebase API key is live', `authorizedDomains: ${(body.authorizedDomains || []).length}`);
    } else {
      const reason = body?.error?.message || `HTTP ${probe.status}`;
      record(false, 'Firebase API key is live', reason);
    }
  }

  // ── the App Check site key, without which the app throws before it renders ──
  // getFirebaseApp() fails closed in production when VITE_FIREBASE_APP_CHECK_KEY is
  // unset. Vite substitutes a missing env var with an empty string *without failing the
  // build*, so the throw lands in the browser: `npm run build` succeeds, the deploy
  // succeeds, every other check here passes, and the site is a white screen for
  // everyone. Same shape as the deleted API key above — a build-time input that nothing
  // validated — so it gets the same treatment. reCAPTCHA Enterprise site keys are `6L…`.
  const appCheckKey = (bundle.match(/6L[A-Za-z0-9_-]{20,}/) || [])[0];
  record(
    Boolean(appCheckKey),
    'App Check site key is baked into the bundle',
    appCheckKey
      ? `${appCheckKey.slice(0, 6)}…`
      : 'VITE_FIREBASE_APP_CHECK_KEY missing at build time — the app throws on boot',
    !IS_PRODUCTION,
  );

  // ── the service worker, since a stale one can pin users to an old build ──
  const sw = await fetch(ORIGIN + '/sw.js');
  record(sw.ok, `service worker serves ${sw.status}`);
  const swCache = sw.headers.get('cache-control') || '';
  record(
    /no-cache|no-store|must-revalidate/.test(swCache),
    'service worker is served uncacheable',
    swCache || '(no cache-control)',
  );

  // ── error reporting endpoint ──
  // This check used to record a *pass* when no endpoint was found in the bundle, and
  // that is precisely how the endpoint stayed dead for weeks: VITE_ERROR_REPORT_URL was
  // never set, installConfiguredErrorSink() returned false, the PWA was console-only,
  // and smoke still read 10/10. On the production origin a missing URL is now a hard
  // failure — crash reporting being absent is the thing this check exists to detect.
  // Off-production (previews, local `npm run dev` builds) it stays an honest skip.
  const endpoint = (bundle.match(/https:\/\/[a-z0-9.-]*workers\.dev/) || [])[0];
  if (!endpoint) {
    record(
      false,
      'error report URL is baked into the bundle',
      'VITE_ERROR_REPORT_URL missing at build time — crash reports go nowhere',
      !IS_PRODUCTION,
    );
  } else {
    // Being in the bundle is not enough: the browser blocks the POST unless the host is
    // also in connect-src. Both wiring steps were needed last time and only one was done.
    const allowed = csp.includes(new URL(endpoint).origin);
    record(
      allowed,
      'error endpoint is allowed by CSP connect-src',
      allowed ? endpoint : `${endpoint} absent from connect-src`,
      !IS_PRODUCTION,
    );
  }
  if (endpoint) {
    try {
      const opt = await fetch(endpoint, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
      });
      record(
        opt.status === 204 && opt.headers.get('access-control-allow-origin') === ORIGIN,
        'error endpoint accepts this origin',
        `HTTP ${opt.status}`,
        true,
      );
    } catch (err) {
      record(false, 'error endpoint reachable', err.message, true);
    }
  }

  return;
}

await main();

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
console.log(`\nSmoke test — ${ORIGIN}\n`);
for (const r of results) {
  const mark = r.ok ? 'PASS' : r.soft ? 'WARN' : 'FAIL';
  console.log(`  ${pad(mark, 5)} ${pad(r.name, 46)} ${r.detail}`);
}
console.log(
  `\n  ${results.filter((r) => r.ok).length}/${results.length} checks passed` +
    (hardFailures ? `, ${hardFailures} hard failure(s)\n` : '\n'),
);
process.exit(hardFailures ? 1 : 0);
