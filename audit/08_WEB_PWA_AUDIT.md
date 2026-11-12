# Web and PWA audit

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

`web/src/App.tsx:33–40,54–81,120–134` subscribes and unsubscribes auth, applies locale, scopes preferences synchronization to the user and keys the main shell by UID. Unknown preferences have loading and explicit recovery states. `web/src/views/MainShell.tsx:215–230` keeps visited panels mounted to preserve local state, with inactive panels hidden and inert. That also keeps component effects active, covered in [performance](10_PERFORMANCE.md). Error boundaries and loading states should be exercised through the existing browser suite. The record list computes day totals from the same filtered row set (`web/src/viewmodels/useRecordViewModel.ts:52–79,334–364`).

`web/vite.config.ts:24–51,56–79` configures an auto-updating Workbox app shell, precaches built JS, CSS and static assets and splits Firebase and React. The Workbox configuration has no Firestore runtime cache. Firebase persistence is a separate opt-in mechanism. Static-cache availability and authenticated offline data availability have different prerequisites. Hosting sets CSP and special service worker cache headers in `firebase.json`. Browser-specific startup, update activation in a second tab, interrupted precache installation and deployed headers remain validation gaps. Use local production preview and disposable emulator accounts for this matrix.

The UI uses an online status banner (`MainShell.tsx:184–195`), which is independent of Firestore acknowledgement. Use the [sync audit](04_OFFLINE_SYNC_AND_CONCURRENCY.md) for local enqueue, pending metadata and rejection paths. Focus trapping and Escape support exist, including separate handling for an active discard confirmation (`web/src/views/AddTransactionView.tsx:61–62`). Settings picker keyboard behavior is covered in [privacy and accessibility](11_PRIVACY_ACCESSIBILITY.md).

## AUS-302 · An open Insights tab omits a newly started month

| Field | Detail |
|---|---|
| Severity and classification | P3 Low, confirmed bug |
| Affected code | `web/src/viewmodels/useInsightsViewModel.ts:28–49`, `web/src/utils/periodUtils.ts:35–65`, `web/src/views/MainShell.tsx:215–230` |
| Status | Source-confirmed. Browser clock regression proposed. |
| Evidence and root cause | The picker options memo reads `Date.now()` and depends only on locale. Insights remains mounted after tab navigation. Re-rendering on an unrelated state change retains the old options. |
| Reproduction | Mount Insights on 30 November with an unchanged locale, advance the clock to 1 December in the same app session, and open the picker. Switch tabs and return. |
| Expected | December appears in the month list after the local month turns. |
| Actual | The mounted picker keeps the November-generated month list until locale changes or Insights remounts. |
| Impact | Long-lived PWA sessions temporarily block selection of a newly started month. Persisted explicit month selections still refer to the selected month. |
| Recommended fix | Key the period options on a local year/month state refreshed at midnight and on foreground resume. Use the same clock for normalization of legacy relative keys. |
| Regression test | Use a browser clock and keep Insights mounted across local midnight on a month boundary. Assert the new month is offered and can be selected without reload. |
| Compatibility | Preserve stored concrete period keys and current locale labels. |

The audit production build also passed a Chromium service-worker smoke check. With networking disabled, Chromium loaded an unvisited route through the Workbox navigation fallback and received the precached app shell. This validates app-shell delivery under that condition. See [test execution](13_TEST_EXECUTION.md) for command and scope.
