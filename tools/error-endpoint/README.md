# Error endpoint

Cloudflare Worker that receives crash reports from the PWA
(`web/src/services/errorSink.ts`). Chosen over a Cloud Function because those
require the Blaze plan and this project stays on Firebase Spark; the Workers free
tier covers 100k requests/day and needs no payment method.

## Deploy

```bash
cd tools/error-endpoint
npm install              # one-time; pins wrangler locally
npx wrangler login       # one-time, opens a browser
npm run deploy
```

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

- Only origins listed in `ALLOWED_ORIGINS` (see `wrangler.toml`) are accepted.
  That keeps crawlers and casual noise out of the log — it is not a security
  boundary, since `Origin` comes from the browser and a non-browser client can
  send whatever it likes.
- Bodies over 16 KB are rejected.
- The client already caps itself at 10 reports per session and dedupes by
  fingerprint, so a crash loop cannot flood this.
