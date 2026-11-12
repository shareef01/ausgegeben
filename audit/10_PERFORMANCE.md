# Performance and scalability

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

## Source review

| Path | Observed behavior | Scaling implication |
|---|---|---|
| Android records | Date-range listeners and paged reads (`app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:699–803`), shared ViewModel flows and background processing (`ExpenseViewModel.kt:91–162`), Compose `LazyColumn` (`RecordScreen.kt:161`) | Scope and laziness reduce initial work. Very dense date windows still produce large snapshots. |
| Web records | Paged retrieval (`web/src/repositories/expenseRepository.ts:749–750`), range listeners (`:780–804`), synchronous filtering and sorting in React memo (`web/src/viewmodels/useRecordViewModel.ts:83–178,347–361`) | Filter work is linear in the candidate count plus sorting. A text keystroke can recompute the list, and snapshot delivery adds mapping and rendering cost. |
| Web Insights | Separate category and range subscriptions, optional prior/budget reads and a capped all-time read (`web/src/viewmodels/useInsightsViewModel.ts:52–188`, `web/src/repositories/expenseRepository.ts:420–451,780–804`) | Visiting additional tabs can keep their effects live because `MainShell.tsx:215–230` retains mounted tabs. The Firebase client can consolidate identical queries, so listener callbacks alone cannot establish billed reads. |
| Android all-time | Latest-history cap and truncation indicator (`AppRepository.kt:1153–1179`) | UI processing is bounded for that path. Explain partial data when the cap is reached. Export and deletion have separate semantics. |
| Recurring materialization and restore | Existing concurrency and fault suites cover transaction/receipt and batch behavior. | Use the evidence in [recurrence](05_RECURRING_TRANSACTIONS.md) and [backup and restore](06_BACKUP_RESTORE.md) before adding indexes or caching. Profile read/write counts for one template catch-up and one large restore. |
| Web startup | Firebase and React manual chunks, lazy views and broad Workbox glob (`web/vite.config.ts:24–51,56–79`) | Asset count and bytes installed by the service worker can exceed the bytes needed for first paint. Measure a clean installation and subsequent update separately. |

## Verification boundaries

### Measured web filtering and sorting

An in-memory Node `v24.16.0` probe extracted the actual `filterRecordExpenses` function with the installed TypeScript parser and transpiled it together with `web/src/utils/money.ts`. It ran in one `node:vm` context. Synthetic expenses used one category, dates shuffled by `i × 2477 mod N`, amounts from `(i mod 997 + 1) / 100`, and alternating notes `coffee` and `lunch`. The probe searched for `coffee`, sorted by descending amount, checked that exactly half of the rows remained and checked descending amounts after each iteration. Five warmups preceded 21 timed calls at each size. This is a shared-host microbenchmark with concurrent audit load, separate from React, DOM, and Firestore.

| Input rows | Median (ms) | p95 (ms) |
|---:|---:|---:|
| 100 | 0.056 | 0.102 |
| 1,000 | 0.585 | 30.268 |
| 10,000 | 74.664 | 169.846 |
| 50,000 | 449.335 | 741.374 |

Dense histories can make the synchronous filter/sort worth profiling. The timings include the VM context and host scheduling, and do not establish browser input latency. Profile a production browser build first. The first targeted candidate is moving repeated minor-unit conversion outside the comparator (`useRecordViewModel.ts:155–178`) or skipping it in date-only sort modes. Rendering also maps each displayed row (`web/src/views/RecordView.tsx:470–489`) and needs a separate trace before deciding on virtualization.

### Measured web build files

The local `web/dist` produced during this audit contained 35 files totaling 1,818,538 bytes. Measuring individual JavaScript files with Node `zlib.gzipSync` gave the following sizes. These are file measurements and do not represent aggregate network transfer or time to interactive.

| Chunk | On disk (bytes) | gzip (bytes) |
|---|---:|---:|
| Firebase Firestore | 505,802 | 145,427 |
| Firebase core | 158,584 | 49,947 |
| React vendor | 218,766 | 67,533 |
| Index | 89,664 | 27,062 |

The generated `sw.js` contained `precacheAndRoute`. Confirm precache installation and fetch behavior using a browser before using build size to infer offline reliability.

`web/emulator/readReduction.test.ts`, `monthAggregation.test.ts` and `aggregationInvariant.test.ts` are relevant regression suites. Their execution status belongs in [test execution](13_TEST_EXECUTION.md). Production quota and billed reads depend on actual reconnects, deployment indexes and user activity, and were not measured. A repeatable scalability check should use disposable data with 100, 1,000, 10,000 and 50,000 rows, varying month density independently of total history. Record initial snapshots and pages, redundant requests after opening every tab, heap/DOM count, keyboard-to-render latency and cached versus cold startup. Android still needs cold-start timing, frame and memory traces and recomposition counts on a representative device. Check Android build timing and web bundle outputs against the environment and commands in the execution report.

The isolated commit build transformed 2,160 modules in Vite 8.3.5 and reported 13.41 s for the Vite build stage under concurrent audit load. The Workbox generator recorded 46 precache entries (1,748.29 KiB). The Firestore chunk reported 505.82 kB uncompressed and 146.93 kB gzip in that build. Those artifacts and the preexisting local bundle sampled above were generated independently.

The isolated Android artifacts were 81,958,952 bytes for the debug APK and 7,269,385 bytes for the unsigned, shrunk release APK. The combined cold audit Gradle invocation (JVM tests, lint, debug and R8 release) took 24m 49s with other audit jobs running. This timing is a single elapsed run, not an isolated build benchmark.
