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

The web e2e suite was run after the changes; Phase 1 ended at 34/34 after raising two
emulator-heavy budgets. **Phase 2 re-verification** (same host): 64 files / 717 web unit
tests, 35/35 e2e (4.5 min), 508 Android JVM tests (15 emulator-dependent cases skipped
offline), 15/15 of those recovery cases with the Firestore/Auth emulators, **68/68 Android
instrumentation tests**, `lintProdDebug`, and an R8 `assembleProdRelease` that was installed
and launched on an API 36 emulator. Exact commands and timings are in
[test-results.md](test-results.md).

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
| F-05 | Medium | Record's global budget bar counts only rows dated up to today (`rowsCountedToDate`), while the current-month category-budget progress on Insights counted every row in the month, including future-dated ("upcoming") rows. Both platforms behaved the same way, so this was a shared semantic ambiguity rather than a parity break. | `web/src/viewmodels/useInsightsViewModel.ts` → `CategoryBudgetInsights`; Android `InsightsViewModel.budgetExpenses`; `categoryBudgetProgress` on both | **Fixed (additive disclosure)** |
| F-06 | Low | Filter/search state lived in a ViewModel (survives rotation, not process death) and the add/category overlay stack was `remember`ed, so an open editor closed on rotation/process recreation. | `AppOverlayState.kt`, `ExpenseViewModel`, `AddExpenseViewModel` | **Fixed** |
| F-07 | Medium | `deleteAccount` cleared the local submission journal before `clearResidualAuthStorage`/`clearLocalFirestoreCache`; an IndexedDB failure at that point reported an error and skipped the remaining local cleanup. The account and cloud data were already gone, so this was a local-privacy gap, not a data-loss path. | `web/src/services/authService.ts` | **Fixed (independent steps + durable retry)** |
| F-08 | Low | Two responsive e2e tests timed out at 30 s after reaching their final assertions; the matrix re-authenticated for 12 contexts and the overflow check read geometry once, racing lazy rendering on a loaded host. | `web/e2e/responsive.spec.ts` | **Fixed (context reuse, geometry polling; timings documented)** |

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

### F-05 — actual, upcoming and anticipated budget spending (fixed, additive)

The original discrepancy was real but shared by both clients: Record's global bar used
`rowsCountedToDate` (actual), while `categoryBudgetProgress` summed the whole current month
(actual + future-dated rows). The fix keeps both existing primary metrics and makes the
meaning explicit instead of guessing a new one:

- `categoryBudgetProgress(budgets, categories, expenses, cutoffMillis)` now also returns
  `spentToDate` (before local midnight tomorrow), `upcoming` (at/after it) and `anticipated`
  (their sum). `spent`, `percent`, `remaining` and `state` are unchanged and equal the
  anticipated values, so no stored setting, total or rule changes.
- When `upcoming > 0`, both clients label the category card "anticipated" and show a
  "spent so far · upcoming" split. Record's global bar remains actual and adds an
  "upcoming · anticipated" line. With no future rows the copy remains "spent" on web / the
  numeric "spent" label on Android.
- Transfers, soft-deleted rows, income and migrating categories are excluded from all three
  on both platforms. No new Firestore read is introduced: the split is computed from the
  rows already loaded for the month.
- `testdata/budget-spend-parity.json` is a shared fixture consumed by
  `web/src/utils/budgetSpendParity.test.ts` and Android `FinancialParityTest`. Cases:
  current month (actual + upcoming + two same-content rows + transfer + deleted + migrating),
  past month (all actual), future month (all upcoming), the local-midnight boundary, the
  Europe/Berlin DST day, and an empty month. The no-cutoff call is asserted to keep the
  historical "everything is spent" contract.
- Browser coverage: `e2e/categoryBudgets.spec.ts` creates one actual and one future-dated
  expense, sets a category and global budget, and asserts the Record disclosure and the
  Insights split text. It is skipped only when today is the last day of the month, because
  no future day remains in the current month.

The owner approved the following warning states in Phase 3, implemented identically on both
clients: actual over → red **Over budget**; actual within but anticipated over → amber
**Projected to exceed budget**; both within → the existing reached/warning/normal
indicators. `percent`, `remaining` and `overspent` remain anticipated-based; the projected
card labels the overage "projected over" so it is not confused with actual overspending. No
stored value or financial total changes.

### F-06 — Android filter and editor state restoration (fixed)

- **Filters.** `ExpenseViewModel` takes an optional `SavedStateHandle` (Hilt supplies it; the
  test/design-QA constructors keep working). It restores search, type, category ids, amount
  bounds, sort and list period after process death. Values are type- and length-validated;
  unknown/outdated values fall back to defaults. The saved owner uid must match the current
  account, so one account's search text never appears for another. A single empty category
  emission no longer erases restored category filters; an authoritative empty snapshot still
  prunes them.
- **Editor.** `AddExpenseViewModel` saves amount, note, category id, date, editing id/owner,
  type tab, the dirty baseline and the edited row's original values. A restored edit therefore
  remains a field-level patch (AUS-104) rather than a whole-row overwrite. The category id is
  resolved once the category snapshot arrives; a deleted category stays unresolved and Save
  refuses instead of guessing. `_isSaving` is deliberately not restored, so restoring can
  never replay a save. `resetForm`, successful save, sign-out and account switch clear the
  saved draft; a mismatched owner resets it and closes the restored overlay.
- **Overlay.** The add/edit overlay stack is persisted with `rememberSaveable`; the main tab
  was already persisted in F-02. The account-change reset now runs only on a genuine change,
  so the initial composition after process death no longer closes a restored editor.
- **Tests.** 5 new JVM tests in `AddExpenseViewModelTest` (new draft, edit with original,
  cross-account discard, reset, stale id/no double insert) and 4 new JVM tests in
  `ExpenseViewModelTest` (same-account restore, cross-account discard, a transient
  account-less ViewModel not erasing the saved state, invalid values). The Activity
  recreation instrumentation test (`MainActivityLaunchTest`) runs on an emulator and passes,
  proving the Hilt `SavedStateHandle` injection works with the per-account store.

Remaining gap: a full rotation UI test that drives a signed-in editor through Firebase is not
in the suite; the view-model and Activity-recreation layers are covered separately.

### F-07 — account deletion/local cleanup (fixed)

`web/src/services/localCleanup.ts` runs every local step independently:

```
firestore-cache -> submission-journal -> onboarding-flag (delete only)
                -> residual auth storage -> auth persistence -> trusted-device preference
```

Each step has its own try/catch; a failure is recorded and later steps still run. A durable
marker (`ausgegeben-local-cleanup-pending-v1`) stores only `{uid, mode, requestedAt}` and is
removed only when every step succeeds. `App` retries the marker on a later launch when no
account is signed in; the retry is skipped while any account is active because the Firestore
cache is origin-wide. The journal wipe is account-scoped. The marker contains no financial
data, note, credential or token.

The Firestore cache and journal wipes are bounded (20 s / 10 s) so a blocked IndexedDB
connection cannot hang sign-out/deletion. An environment without IndexedDB is a no-op
success; a present-but-blocked database is a recorded failure and keeps the marker. The
cleanup uses only local APIs, so it never depends on the already-deleted Auth token.

`authService.signOut`/`deleteAccount` now call the orchestrator, reset the in-memory stores
and broadcast/tab-reset regardless, and throw `LocalCleanupError` only after every step has
run. Settings shows a "retrying on next launch" message when the marker was persisted, or a
"clear this site's data" message when it could not be. Neither message claims the local data
was cleared.

Tests: 13 `localCleanup.test.ts` cases (per-step failure injection, retry after partial
failure, blocked cache timeout, marker-write failure, no retry while another account is
signed in, corrupt/unknown marker) plus an `authService` test asserting the later steps run
when the cache and journal fail. `clearExpenseSubmissionJournal` now returns a boolean and
the storage reset helpers return whether storage access succeeded.

Browser limitation: deleting an IndexedDB cache is not a secure-overwrite guarantee. A
blocked database or another open tab can leave cached data until the retry or a manual
site-data clear; the UI never reports success in that state.

### Phase 3 — owner-approved budget warning states

The owner chose the warning semantics, implemented identically on both clients:

- `categoryBudgetProgress.state` is now **over** only when `spentToDate > monthlyLimit`;
  when actual is within but anticipated exceeds it the state is **projected**; otherwise
  the existing `reached`/`warning`/`normal` thresholds apply.
- Web and Android cards, progress fills and status copy use red only for **over**, amber for
  **projected**, and keep the existing normal/progress treatment. The projected card's
  bottom line says "projected over" rather than "overspent".
- The Insights totals dock labels its current-month expense total **anticipated** and shows
  a `spent so far · upcoming` detail; its net label becomes **anticipated net cash flow**.
- The spending-pace badge is amber when actual spending is within budget but the projection
  is over, red only when actual spending already exceeds it. `SpendingPace` gains
  `actualExpenses` (and web `actualOverBudget`) for this distinction; no projection formula
  changed.
- `testdata/budget-spend-parity.json` gained five boundary cases (actual over, actual at the
  limit + one upcoming cent, reached, threshold, below threshold) in addition to the
  existing current/past/future, midnight, DST, recurring, transfer, deleted and empty cases.
  Web and Android both assert the same states and actual/anticipated values.
- No stored amount, preference, rule, index, query or Firestore read changed.

Visual verification captured 36 browser screenshots (375/768/1440, light/dark, plus German
375) of auth, Record, add/edit, Insights, category budgets, Settings, backup and the delete
dialog. One real defect was fixed: the German category line stranded the `·` before a wrapped
percentage; the separator and percentage now wrap together. No clipping or horizontal
overflow was found in the inspected screens.

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

1. **Run the remaining manual accessibility pass** (TalkBack/VoiceOver/NVDA) and a real
   rotation UI test with a signed-in editor. Instrumentation now runs on an API 36 emulator
   (68 tests), and a signed R8 release was built, installed and launched; an automated
   screen-reader audit is still outstanding.
2. **WebKit/phone Playwright projects** (the brief's 320–430 px matrix): the suite currently
   runs Chromium desktop only; responsive specs emulate phone viewports inside Chromium.
3. **Keep the e2e suite lean**: the responsive matrix now reuses one context/sign-in and
   polls geometry (23.9 s vs 1.3 m for the overflow test; 6.7 s / 6.5 s for the two former
   timeouts). Add WebKit only after the same context-reuse pattern.
4. **Opportunistic CSS consolidation**: `pages.css` remains large and load-order-sensitive;
   continue the per-component pass started in Round 15 rather than a big-bang rewrite.

---

## 6. Verification

See [test-results.md](test-results.md) for exact commands, counts, timings and environment
limits. Summary: 717 web unit tests, 146 rules tests, 190 web emulator tests, 35/35
Playwright tests, 508 Android JVM tests (15 skipped only when emulators are absent; all 15
pass with them), 68/68 Android instrumentation tests on API 36, `lintProdDebug`, and a signed
R8 release build that was installed, launched, rotated and restarted on the emulator with no
fatal error. The release APK was **not published** and no production deployment, billing
change, Firestore data mutation or App Check enforcement change was performed. Phase 3 also
inspected 36 browser screenshots across 375/768/1440 and both themes; Firefox and WebKit
rendered the auth screen without page errors.

---

## 7. Deep-audit addendum (2026-11-23, evening)

Committed in `e88e124` (`fix/audit-pwa-update-cross-account`), reviewed for this addendum:

| Area | What broke for a person | Fix | Evidence |
|---|---|---|---|
| PWA update | After a deploy, an open tab's lazily loaded screens (Add, Settings, Insights) no longer existed; opening one crashed to the error screen, whose reload discarded changes made offline that had not synced | Lazy screens are fetched while the precache is intact; a missing chunk shows a short notice and reloads only once no write is waiting; the error screen warns about unsynced changes | `staleBuild.test.ts`, `qa/pwa-update-repro.mjs` |
| Preferences | A write still running for one account could apply its result (budget, currency, "settled") after switching to another account | Per-session generation guard on web and Android; Android no longer creates the preferences document from a cache-only "missing" answer | 6 flow tests in `preferencesSync.flow.test.ts`; `PreferencesCloudSyncTest.shouldCreateFromLocal…` |
| Sign-out | The sign-in form appeared before the local wipe finished; a second account signing in at that moment lost its Firestore instance and was signed out again in every tab | The form waits for the wipe; the cross-tab signal is sent before the wipe, so a reload mid-sign-out cannot drop it; the launch retry is gated once per load | `authService.test.ts`, `e2e/crossTabAccounts.spec.ts` (2/2) |

Fixed in this pass (uncommitted):

| Area | What broke for a person | Fix | Evidence |
|---|---|---|---|
| Web typography | Long German category names on Insights, Record chips and category management broke mid-word with no hyphen ("Haushaltsversich / erung") | `hyphens: auto` beside the existing `overflow-wrap: anywhere` (the page's `lang` follows the UI locale) | Screenshot at 379 px now shows "Haushaltsversi- / cherung" |
| Web forms | The search placeholder was cut mid-word ("…kategorien suche") in the desktop filter column and on tablets; the amount placeholders at 320 px and on landscape phones | While the field is empty it no longer reserves room for the clear button (which only exists with a query) and clipped text ends in an ellipsis | New audit check; negative control 20 FAIL → 0 FAIL |
| QA tooling | `qa/responsive-audit.mjs --themes` left the shared QA account on its last theme, so every later sweep measured the soft-light theme while labelling its screenshots light/dark | The reset waits until the stored preference reads `system` and reports a FAIL if it never does | Stored value `soft_light` before, `system` after |

Review notes on `e88e124` (no change made):

- Android's generation guard is covered only indirectly (the `shouldCreateFromLocal` rule is
  unit-tested; the guard itself needs a Firestore fake to test).
- `AuthStore.endingSession` is one flag. If another tab's sign-out signal arrives while this
  tab's own sign-out is still wiping, whichever finishes first lifts the loading screen early.
  Fixed separately in PR #188 (the sign-in form stays held while any session-ending work runs).
- In the account-deletion e2e test the deleting account's preferences write is refused by the
  rules (`accountAcceptsWrites`). That is the rules doing their job, but the client could skip
  the write once deletion has started.

**Cross-account sign-out (fixed after the addendum).** The sign-out signal between tabs
carried no account id. In session-only mode ("keep me signed in" off), signing out in one
tab also signed out a *different* account open in another tab of the same browser, and the
cache-clear signal terminated that tab's Firestore instance, discarding any of its writes
that had not reached the server yet. Both signals now carry the account
(`{ type, uid }`):

- A tab ends its session only for its own account. A tab with no user yet waits until Auth
  has initialized and then decides, so a tab restoring the same account's session is still
  signed out, while one that is signed out or signing in to another account is left alone.
- A tab closes its Firestore instance for another account's sign-out only if it holds the
  shared on-disk cache, which has to be released before it can be deleted. A memory-only
  instance keeps running with its write queue.
- A message without an account (a tab still on an older build, or a sign-out with no
  session) is handled as before, by every tab.

Regression tests: 7 unit tests in `authService.test.ts`, 1 in `localCleanup.test.ts`, and
the e2e test "signing out in one session-only tab leaves a different account in another tab
signed in and working". Negative controls: with the account check disabled, 2 unit tests
and the e2e test fail; with the Firestore guard disabled, the other account's tab logs
"Firestore shutting down" and the e2e test fails.

Trusted-device follow-up (fixed): a tab of another account that uses the on-disk cache
still has to close its instance so the cache can be deleted, and its writes not yet on the
server were deleted with it. That tab now sends them first and closes only once they have
reached the server (at most 8 s); the signing-out tab waits for it (at most 10 s). If the
writes cannot be sent (offline), the tab keeps the cache open, the cache step fails as
"deferred", the cleanup marker stays and the sign-out shows the "will be retried" message;
the wipe runs on a later launch. Older builds that do not answer still get the previous
250 ms. A session ending in a page load no longer triggers the launch retry in that same
load, so the sign-in form is not held a second time.

Regression tests: 6 unit tests in `firebaseCacheClearPeers.test.ts` (real
BroadcastChannels) and the e2e test "another account signing out never deletes a
trusted-device tab's writes that are still waiting for the server" (B offline with a queued
expense, A signs out, B reconnects, the expense reaches the emulator). Negative control:
with the peer closing at once as before, the e2e test fails twice over: no cleanup marker,
and the server never receives the queued expense.

**Spark compatibility.** No Cloud Functions, scheduled jobs, Storage, extensions or paid APIs
were added; `firebase.json`, `firestore.rules`, indexes and dependencies are unchanged. All
new logic is client-side. The diff contains no keys or credentials (only emulator
placeholders and test fixtures).
