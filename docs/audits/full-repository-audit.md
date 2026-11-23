# Ausgegeben — full repository audit (2026-11-23)

**Base commit:** `f34e2ad` (`main`, tag `v2.1.21`) · **Working branch:** `audit/full-repository-2026-11`
**Scope:** Android client (`app/`), React PWA (`web/`), Firestore rules/indexes, Firebase
Hosting config, CI workflow definitions, and the documentation that describes them.

This is an implementation record, not only a findings list. Every "fixed" item below has the
test or command that verified it; items that were not run are called out as environment
limitations in [test-results.md](test-results.md).

---

## 1. Architecture as built

| Layer | Implementation | Notes verified in source |
|---|---|---|
| Android | Kotlin, Jetpack Compose, Material 3, Hilt, WorkManager, DataStore | Single activity (`MainActivity`), Compose navigation via `Route` + `MainTabPager`, Hilt ViewModels, per-account ViewModel store (`rememberAccountViewModelStoreOwner`) |
| Web | React 19 + TypeScript, Vite, Zustand, vite-plugin-pwa (`autoUpdate`) | `App` → lazy `SignedInApp` → `MainShell`; tab state is in `?tab=`; views lazy-loaded |
| Backend | Firebase Authentication (email/password) + Cloud Firestore + Hosting | Web SDK imports only `firebase/app`, `auth`, `firestore`, `app-check`; Android BOM products only `firebase-auth`, `firebase-firestore`, `firebase-appcheck-*` |
| Sync | Client SDKs with offline persistence | Android persistent disk cache; web memory cache by default, IndexedDB only after explicit trusted-device opt-in |
| Shared contracts | `testdata/financial-parity.json`, `testdata/money-parity.json`, `web/rules`, `web/emulator` | Executed by both Kotlin and TypeScript tests through production functions |

### Firestore tree

```
users/{uid}/
  categories/{categoryId}
  expenses/{expenseId}
  categoryBudgets/{categoryId}
  recurringTransactions/{templateId}
  recurringOccurrences/{templateId_yyyy-mm-dd}
  settings/preferences
  meta/dedupe                 (one-time maintenance markers)
  meta/restoreOperation       (replace-restore journal + lease)
  meta/accountDeletion        (permanent write-freeze tombstone)
  restoreSnapshot/{meta|chunk_n|receipt_chunk_n}
```

`users/{uid}` itself denies read/write. `app/.../data/FirestorePaths.kt` and
`web/src/repositories/firestorePaths.ts` are mirrored registries; their tests fail if a
path constant is added without classifying it for account deletion.

---

## 2. Baseline established before changes

| Check | Result |
|---|---|
| `git status` | clean; `main` at `f34e2ad`, tracking `origin/main` |
| `cd web && npm test` | 62 files / **691 tests passed** |
| `cd web && npm run lint` (`tsc --noEmit`) | passed |
| `cd web && npm run lint:css` | passed (600 class tokens) |
| `cd web && npm run lint:hooks` (ESLint) | passed |
| `cd web && npm run lint:telemetry` | passed |
| `cd web && npm run build` | passed (PWA precache 51 entries) |
| `cd web && npm run test:rules` | 4 files / **146 tests passed** |
| `cd web && npm run test:emulator` | 21 files / **190 tests passed** |
| `./gradlew :app:testProdDebugUnitTest :app:assembleProdDebug` | **BUILD SUCCESSFUL** (5m 45s) |

The web e2e suite was run after the changes; see [test-results.md](test-results.md) for the
two default-timeout flakes and their rerun.

---

## 3. Findings

Severity: Critical / High / Medium / Low. "Fixed" means a code change plus a regression
check; "Open" means documented with evidence and a reason it was not changed in this pass.

| ID | Severity | Finding | Location | Status |
|---|---|---|---|---|
| F-01 | Medium | A day whose only rows are transfers produced a `{income: 0, expense: 0}` day-totals bucket on web but no entry on Android. The two clients therefore disagreed about the day-totals map (the documented "empty day header" divergence). | `web/src/utils/analytics.ts#computeDayTotals`; fixture `testdata/financial-parity.json#dayTotalsTransferOnlyDay` | **Fixed** |
| F-02 | Medium | The Android selected main tab was held in a plain Compose `remember`. A configuration change or process death recreated the composition and silently returned the user to Record from Insights/Settings. | `app/.../ui/AppOverlayState.kt`; `Navigation.kt` | **Fixed** |
| F-03 | Low | The add/edit transaction dialog used one DOM id (`add-txn-error`) for three different error regions. Today `vm.error` is a single message so only one renders, but the shared id made `aria-describedby` ambiguous the moment the regions coexist. | `web/src/views/AddTransactionView.tsx` | **Fixed** (ids split + e2e assertion) |
| F-04 | Low | A source comment pointed at `recordGrouping.test.ts`, which does not exist; the actual suite is `viewmodels/recordDayTotals.test.ts`. | `web/src/utils/recordGrouping.ts` | **Fixed** (comment corrected) |
| F-05 | Medium | Record's global budget bar counts only rows dated up to today (`rowsCountedToDate`), while the current-month category-budget progress on Insights counts every row in the month, including future-dated ("upcoming") rows. Both platforms behave the same way, so this is a shared semantic decision rather than a parity break. | `web/src/viewmodels/useInsightsViewModel.ts` → `CategoryBudgetInsights`; Android `InsightsViewModel.budgetExpenses` | **Open — documented** |
| F-06 | Low | Filter/search state lives in a ViewModel (survives rotation, not process death) and the add/category overlay stacks are `remember`ed (an open sheet closes on rotation). Only the main tab is now persisted. | `AppOverlayState.kt`, `ExpenseViewModel` | **Open — documented** |
| F-07 | Low | `deleteAccount` clears the local submission journal before `clearResidualAuthStorage`/`clearLocalFirestoreCache`; an IndexedDB failure at that point would report an error and skip the remaining local cleanup. The account and cloud data are already gone, so this is a local-hygiene edge case, not a data-loss path. | `web/src/services/authService.ts` | **Open — documented** |

### F-01 — transfer-only day totals (fixed)

`computeDayTotals` initialised a bucket before checking whether the row contributed income or
expense. Android's implementation skips transfers before bucketing. The fixture already
named `dayTotalsTransferOnlyDay`, and the web test asserted the divergence instead of
rejecting it.

Fix: skip transfers before creating the bucket, so both clients return exactly the same
day-totals map. Rendering is unchanged on both platforms — a transfer-only day still shows
its date header (the rows are visible); it simply has no income/expense total.

Regression checks:
- `web/src/utils/analytics.test.ts` asserts a transfer-only day is absent and the map has
  exactly one key.
- `web/src/utils/financialParity.test.ts` asserts the fixture day is absent and that no
  zero-valued day entries exist at all.
- `app/.../util/FinancialParityTest.kt` (unchanged expectation) continues to assert absence
  and the same entry count.

### F-02 — Android tab state across recreation (fixed)

`AppOverlayState.selectedTab` is now initialised from a `rememberSaveable` string key, and a
`LaunchedEffect` writes the key when the tab changes. `Route.storageKey` / 
`mainTabFromStorageKey` map the sealed `Route` to a Bundle-safe string and fall back to
Record for unknown values (including overlay routes, which are not tabs).

Regression checks:
- New JVM test `app/src/test/java/com/aus/ausgegeben/ui/NavigationTest.kt`: round-trip for
  every main tab, stable/distinct keys, unknown and overlay keys fall back to Record.
- `./gradlew :app:testProdDebugUnitTest --tests '*NavigationTest*'` passes.
- Full `:app:testProdDebugUnitTest` + `:app:assembleProdDebug` still build successfully.

Deliberate limit: the add-transaction and category overlays are not persisted. Their drafts
are ViewModel state and are discarded by process death, so restoring an empty sheet would be
worse than closing it. On a plain rotation the amount/note draft survives in the ViewModel
but the sheet returns to the list; this remains a known gap (F-06).

### F-03 — transaction dialog error element ids (fixed)

`amount`, `category`, and form-level errors now use `add-txn-amount-error`,
`add-txn-category-error`, and `add-txn-form-error`. `aria-describedby` points at the exact
region. `e2e/addTransactionDiscard.spec.ts` now asserts that the amount input describes
`#add-txn-amount-error` and that exactly one such node exists.

### F-05 — what counts as "spent" in a category budget (open)

Evidence:

- Record: `monthSpent = rowsCountedToDate(...)` (`web/src/viewmodels/useRecordViewModel.ts`),
  i.e. rows dated after tomorrow 00:00 are excluded.
- Insights: `CategoryBudgetInsights` receives the unfiltered period rows
  (`useInsightsViewModel.budgetExpenses`), and `categoryBudgetProgress` sums all of them.
- Android mirrors both choices (`RecordScreen` uses `uiState.data.monthExpenses`, which is
  to-date; `InsightsViewModel` passes `scoped`).

A user who logs rent for the 28th on the 5th can therefore see a lower "spent" for the
global budget on Record than for the same category budget on Insights. Because both clients
agree with each other, changing one platform would create a real parity break. The safe
follow-up is a product decision (should a budget measure actual spend or committed spend for
the month?) followed by the same change on both clients and a new parity fixture. Not
changed in this pass.

### F-07 — account deletion local-cleanup ordering (open)

`authService.deleteAccount` awaits `clearExpenseSubmissionJournal(user.uid)` before resetting
the persistence flags and clearing the Firestore cache. If that IndexedDB write fails, the
function throws before the later cleanup. The Firebase Auth identity and every cloud
collection are already deleted, and `onAuthStateChanged` clears the signed-in UI, so the
consequence is residual local storage rather than remote data loss. A defensive `try/catch`
around the journal clear (matching how sign-out already treats local cleanup) would close it;
it was left out of this pass to keep the deletion path unchanged and unverified-failure-free.

---

## 4. Areas audited with no defect found

The following were read and exercised, not merely skimmed:

- **Firestore rules** (`firestore.rules`): unauthenticated access, cross-user reads/writes,
  deletion freeze, verified-email gating, recent-`auth_time` requirement for account deletion,
  cent-granular amounts, timestamp skew bounds, restore lease fencing, snapshot chunk-id
  bounds, legacy-field tolerance, category migration barriers. 146 adversarial/emulator rule
  tests pass.
- **Money and financial parity**: total/income/expense/transfer separation, integer-cent
  accumulation, day/month bucket boundaries (including DST), budget progress/allocation,
  period comparison, spending pace, CSV amounts, backup amounts — all pass through the shared
  fixture on both platforms.
- **Idempotency and offline writes**: deterministic expense document IDs from a SHA-256 of the
  operation key, transactional create-if-absent, legacy key lookup first, journal
  reconciliation on cold start, `settleOrQueue` grace period, unload guard only for
  memory-only tabs, per-account queue reset. Emulator suite: 190 tests.
- **Restore/replace**: pre-flight validation, safety snapshot, fenced lease updates, batched
  expenses with revision reconciliation, rollback, and concurrent-writer tests.
- **Recurring engine**: deterministic occurrence dates, idempotent receipts, catch-up backlog,
  two-client races, disabled/quarantined templates.
- **Telemetry privacy**: runtime allowlist of context keys, credential redaction, closed
  throw sites guard, opt-out clearing the replay buffer.
- **Web shell**: URL-backed tabs, Back/Forward, skip link, inert inactive panels, focus traps,
  body-scroll lock refcounting, cross-tab auth invalidation, cache clearing after sign-out.
- **Android**: manifest hardening (`allowBackup=false`, no exported components beyond the
  launcher), App Check provider fallback, WorkManager initializer override, edge-to-edge
  insets, Compose semantics on the navigation rail and colour/icon pickers.

---

## 5. Risks and recommendations (prioritised)

1. **Decide the budget-with-future-rows contract (F-05)** and implement it identically on
   both clients, with a parity fixture row. This is the only unresolved item that can show
   two different euro amounts for the same month in the same app.
2. **Run the remaining real-device gates** that this environment could not: Android
   instrumentation (`connectedProdDebugAndroidTest`), a signed R8 release on an emulator, and
   a TalkBack/VoiceOver pass. The JVM and Compose compile gates pass, but they cannot prove
   runtime semantics.
3. **WebKit/phone Playwright projects** (the brief's 320–430 px matrix): the suite currently
   runs Chromium desktop only; responsive specs emulate phone viewports inside Chromium.
4. **Android process-death restoration for filters and overlays (F-06)**: move filter state
   into a `SavedStateHandle`-backed ViewModel if drafts are required to survive process death.
5. **Opportunistic CSS consolidation**: `pages.css` remains large and load-order-sensitive;
   continue the per-component pass started in Round 15 rather than a big-bang rewrite.

---

## 6. Verification

See [test-results.md](test-results.md) for exact commands, counts, and environment limits.
No production deployment, billing change, Firestore data mutation, or APK publication was
performed.
