# Error endpoint

Cloudflare Worker that receives crash reports from the PWA
(`web/src/services/errorSink.ts`). Kept outside Firebase so telemetry has an independent
quota/failure domain and does not consume function invocations or Firebase storage.

## Deploy

```bash
cd tools/error-endpoint
npm install              # one-time; pins wrangler locally
npx wrangler login       # one-time, opens a browser
npm run deploy
```

Before deploying, replace both `SET_BEFORE_DEPLOY` App Check values in
`wrangler.toml`. `FIREBASE_PROJECT_NUMBER` is the numeric Firebase project number;
`FIREBASE_APP_IDS` is a comma-separated allowlist of web App IDs. They are public
identifiers, not secrets. Requests fail closed until these values are valid. The PWA
gets an App Check token and sends it in `X-Firebase-AppCheck`; the Worker verifies its
signature, issuer, audience, expiry, and App ID against Google's JWKS.

Deploy prints the Worker URL. Put it in `web/.env.production` as
`VITE_ERROR_REPORT_URL`, add the host to `connect-src` in the root
`firebase.json` CSP, then redeploy the web app.

## Reading reports

There is no database — reports go to `console.error`.

```bash
npm run tail             # live (wrangler tail)
```

Or the Workers Logs tab in the Cloudflare dashboard for recent history. If crash
volume ever outgrows that, add Workers KV or forward to somewhere durable; at a
handful of reports a week, logs are the right size.

## Notes

- Only origins listed in `ALLOWED_ORIGINS` are accepted. Origin is defense in depth;
  verified Firebase App Check is the authorization/abuse-control boundary.
- Bodies over 16 KB are rejected.
- The client already caps itself at 10 reports per session and dedupes by
  fingerprint, so a crash loop cannot flood this.
- Configure the shortest practical Workers Logs retention in the Cloudflare dashboard
  and document the chosen value in the operational runbook; this repository creates no
  durable telemetry database.
