# Audit summary

Newest first. Every item is verified against the real artifact, not just by reading code — per AGENTS.md section 1. Where something could not be verified that way, it says so.

---

# 2026-08-27 — full audit, then ship: v2.0.0

Full-stack audit at `66da782` (three parallel deep audits — Android data layer, web client, infra/CI/workflows — with every high-severity claim re-verified by hand), then all gates re-run, fixes committed, and the whole system shipped: release, web, worker, phone.

## Fixed (11 commits, `a1e0c43`..`4d89a3a`)

| # | Finding | Fix | Verified how |
|---|---|---|---|
| 1 | **MED** web `duplicateExpense` spread the raw doc into `insertExpense`, writing legacy fields (`cloudId` etc.) and the source row's `idempotencyKey` into new documents — the only forbidden-field write on either platform | Narrow whitelist payload (`utils/duplicateExpense.ts`), mirroring Android's `expensePayload`; 4 unit tests incl. legacy-field smuggling | Web unit 69/69; tsc |
| 2 | **MED** `updateExpenseTypesForCategory` aborted whole 450-row chunks on one rules-rejected doc — the recorded `reassignExpenses` incident, re-created in a sibling | Per-doc retry fallback + unfixable count surfaced as failure; healthy rows land | Compile + unit 116/116; web has no type-change path (parity checked, no gap) |
| 3 | **MED** release.yml interpolated secrets/tag directly into `run:` shell | Env-var indirection, matching the file's own convention elsewhere | Runs on next tag — ran, see below |
| 4 | LOW batch: aggregates/amounts read through `Number` (getDouble null-contract could silently zero the budget projection); delete-dialog counts live rows only (both platforms); dedupe sortOrder repairs awaited with per-write catch; budget input bound matches rules' `< 1e9`; worker size cap by bytes not UTF-16 units; stale comments | As listed | Full suites re-run green after |
| 5 | Doc drift: AGENTS.md keystore/JBR claims obsolete (signing material now exists; JBR broken — MS JDK 21 works); FIREBASE_SETUP taught enforcing App Check (would brick both clients) and rules-without-indexes deploys; ANDROID_STUDIO.md had JDK 17, nonexistent task names, wrong APK path, another machine's username; README wrong task name and stale counts (213 → actuals) | Corrected across four docs | Read-back; FIREBASE_SETUP now matches §2 |

## Gates at ship time (all green)

Android unit 116/116 · `lintProdDebug` · instrumentation **8/8 on the AVD** · signed `assembleProdRelease` twice (R8 ~5m, cert via apksigner, `mapping.txt` keeps Room `_Impl`, `-P` overrides honored) · web unit 69/69 · rules 38/38 · emulator 44/44 · tsc/lint:css/build · CI green at final HEAD (`4d89a3a`, 10m14s).

## Shipped

- **v2.0.0** — tagged from `7c5e47b`; CI release ✓ 7m24s *including the emulator boot + 12s launch gate on the signed APK*; published with versionCode 20000 (updates over v1.0.12's 10012).
- **Web** — `npm run deploy` (hosting + rules + indexes), smoke **10/10** including the API-key-live probe. Ships today's web fixes plus the user's own uncommitted-at-the-time `layout.css` escaping fix (now committed, `735fed8`).
- **Error worker** — wrangler pinned locally (`tools/error-endpoint/package.json`, deploy/tail scripts), OAuth login, deployed, live-probed: preflight 204 · report 204 · 20KB body 413 (new byte cap live) · forged origin 403.
- **Phone (user's, with approval)** — this morning's debug sideload (versionCode 1, wrong signature) blocked the update; user approved uninstall+install. v2.0.0 (20000) installed, user opened it and signed in on the real device.

## Not verified / left open

- The user's sign-in was confirmed; **which** in-app checks they ran afterward (e.g. the budget-warning-on-expense check) was not reported — treat the real-account budget path as verified-by-CI-launch only until they say otherwise.
- The new per-doc fallback paths (type change, dedupe repairs) have no reproducible trigger in test data; they fire only if a real account still holds rules-unfixable legacy rows.
- Prefs LWW treating a Timestamp `updatedAt` as 0 remains as designed (such docs can't pass the rules anyway); web delete-gone vs rule-failed toast nuance and month-rollover period staleness left deliberately.
- Tool-state dirs `.kilo/` (52.7 MB) and `.reasonix/` deleted from the working tree at user request.

---

# 2026-08-06 — audit of the uncommitted soft-delete change

Audit of an uncommitted working-tree change (soft-delete filtering + server-side aggregation) that arrived with a walkthrough claiming it was finished and verified. It was neither. Not committed as authored; reworked, then gated.

## What the change got right

Legacy `deleted: true` rows really were being counted as live by every read path — the €7,655 bug in AGENTS.md section 1 — and adding `deleted` to both data models plus filtering the list and listener paths was the correct start.

## What was wrong with it

| # | Finding | Evidence |
|---|---|---|
| 1 | **The inflation fix did not fix the inflation.** `sumMonthExpenses` was switched to a server-side `sum()` that counts soft-deleted rows, with a comment deferring correctness to a hard-delete sweep. That sweep is gated on `meta/dedupe.orphansScannedAt` being unset — already set on every account that has cold-started since the marker shipped. | Emulator probe on an already-swept account seeded with 4 live rows (400.00) and 6 soft-deleted rows (3000.00): purged 0, month total 3400.00 |
| 2 | **Irreversible mass-delete of user records, for zero benefit.** The sweep hard-deleted every `deleted: true` document on both platforms. Nothing in the codebase writes that flag — these are legacy rows only. Combined with finding 1 it could only ever fire on accounts that had none. AGENTS.md section 2: legacy data is tolerated, never rewritten. | `grep` — `deleted` appears only in the rules' legacy tolerance and the new code |
| 3 | **A new inconsistency the app did not have before.** Filtering was applied to the list and listener but not to `getExpensesInRange` or the aggregate, so the same month reported two different numbers. | Same probe: list 400.00, listener 400.00, one-shot 3400.00, budget 3400.00 |
| 4 | **Android bypassed the file's own type-drift defence.** `data["dateMillis"] as? Long` returns null on a Double-typed field → `0L` → range check fails → the row being edited is never subtracted and gets double-counted. AGENTS.md section 1 warns about exactly this drift. | Latent — no Double-typed `dateMillis` was found in any test data; flagged as risk, not demonstrated |
| 5 | **Verification was claimed, not performed.** The walkthrough's "Verification Results" were all logic/syntax assertions; the task list checked off "Final verification (smoke test and log audit)" with no suite run. | Suites were green *and blind* — 65 unit + 39 emulator passed because nothing seeded a `deleted` row |

A sixth concern — that the unchunked delete batch would blow Firestore's 500-write cap, since every other bulk path here is chunked at 400–450 — **was tested and did not reproduce**: 600 writes in one batch committed fine against emulator v1.21.0. Dropped.

## Fix applied

- `sumMonthExpenses` on both platforms now computes `sum(range) − sum(range AND deleted == true)`. Two aggregate reads rather than one, so the Spark quota win holds, and nothing is written. The exclusion path also skips an already-soft-deleted row, which would otherwise be subtracted twice.
- `getExpensesInRange` filters `deleted`, so all three range accessors agree.
- The hard-delete is gone from both platforms; `repairOrphanedExpenses` skips soft-deleted rows rather than destroying them.
- Android reads the excluded row's date with `getLong()`.
- `(transactionType, deleted, dateMillis)` added to `firestore.indexes.json`.

## Regression coverage

`web/emulator/softDeletedRows.test.ts`, 5 cases, every one seeding `orphansScannedAt` first — a fixture that skips it passes against the broken code, which is the whole trap. Confirmed to have teeth by reverting the repository to HEAD: 4 of 5 fail with the inflated numbers (3400 vs 400, 3300 vs 300, 2900 vs 400). The fifth guards against the purge and passes at HEAD by design.

## Gate results

- Web: `tsc --noEmit` clean · `lint:css` 454 tokens · unit 65 · **emulator 44** (39 + 5 new) · rules 38 · build 40 precache entries
- Android: `testProdDebugUnitTest` 116 tests 0 failures · `lintProdDebug` · `assembleProdDebug`

## Not verified

- **`assembleProdRelease` (R8) did not run** — no `keystore.properties` on this machine. Per AGENTS.md section 1 this is the gate that matters most for release; treat the change as unproven against R8.
- **Nothing was run against a real account or a device** at the time this entry was first written. That was corrected the same day — see the device verification below, which found a sixth bug none of the above caught.
- Environment note: the Android Studio JBR at the path AGENTS.md section 4 specifies is incomplete on this machine (missing `lib/jvm.cfg`); the Microsoft JDK 21 already on `JAVA_HOME` was used instead. Same major version. Worth re-checking before trusting that instruction.

## Device verification — and the sixth bug

A prod **debug** APK was sideloaded to the user's Pixel 7 (no release keystore exists on this machine, and debug shares the applicationId, so this cost an uninstall and wiped local prefs — the user chose that knowing the cost). Then: sign in, set a monthly budget of 1, add a €5 expense, read logcat.

**Finding 6 — `sum()` had been failing in production the entire time.** The first save produced:

```
W AddExpenseViewModel: budget check failed
FAILED_PRECONDITION: The query requires an index.
```

Decoding the descriptor Firestore embeds in that error gave `expenses: transactionType, dateMillis, amount, __name__`. **An aggregation's composite index must include the aggregated field** — `amount` — not just the filtered ones. This was never about the soft-delete work: `getAggregateFromServer` was already on web at HEAD, so the deployed web app's budget warning had been silently dead for as long as that aggregate had been live. Moving Android onto an aggregate would have spread the same silent breakage to a second platform.

Three signals said "fine" while it was broken: the emulator invents indexes on demand (44/44 green); `gcloud firestore indexes composite list` reported `READY`, but for a *different* index that had built correctly; and the best-effort wrapper meant the only trace anywhere was one `W` line.

`firestore.indexes.json` now carries `(transactionType, dateMillis, amount)` and `(transactionType, deleted, dateMillis, amount)`, both deployed and `READY`. Re-tested on the device: budget warning fired, logcat clean. Because the code runs both aggregates, that single success confirms both indexes serve.

Deploying the correct index also repaired the deployed web app's budget warning with no code change.

**Also fixed:** `MonthlyBudgetSheet` rendered its header cut off and overlapping. `SheetHeader` and `SheetDismissButton` both call `fillMaxWidth()` internally, so sharing a `Row` let the unweighted button claim the full width and starve the weighted header to zero. Pre-existing since `7409d72` (2026-07-16) — present in the `v1.0.11` release, unrelated to this audit. Header moved above the field, inline dismiss dropped (Clear/Save already close the sheet), `imePadding()` added.

**Still open after device verification:** the subtraction logic is *not* device-proven — this account has no soft-deleted rows, so there was nothing to subtract; that half rests on the five emulator tests. `assembleProdRelease` (R8) still has not run. One orphaned index — the wrong `(transactionType, deleted, dateMillis)` — remains in production; removing it needs `--force`.

---

# 2026-08-02 — full-stack audit

Full-stack audit of Ausgegeben (web PWA + Android app + Firestore rules + CI/CD + live production). Every item below was verified against the real artifact, not just by reading code — per AGENTS.md section 1.

## Fixes shipped (deployed to production on 2026-08-02, user-approved)

| # | Finding | Fix | Verified how |
|---|---|---|---|
| 1 | **firestore.rules off-by-one**: `note.size() < 2000` and category `name.size() < 80` rejected exactly-at-cap values that both clients legitimately write (`slice(0,2000)` / `take(2000)`) — a 2000-char note or 80-char name failed to save with PERMISSION_DENIED after passing every client-side check | Rules bound changed to `<= 2000` / `<= 80`; 2 new boundary tests added | Rules suite 37/37 green (incl. new tests); rules compiled + released to production (`npm run deploy:rules`) |
| 2 | **Onboarding gate did not persist for unverified users**: `onboardingComplete` lived only in memory, and unverified accounts can't write preferences (rules), so every reload (and every sign-out → sign-in) re-showed the whole onboarding flow. Android didn't have this (DataStore); web did | Persist onboarding completion per-uid in localStorage (`ausgegeben-onboarding-complete:<uid>`), seed it on sign-in before the prefs snapshot; also fixed `App.tsx` resetting all preferences on the transient null user emitted during Auth init (reload). **Review-driven follow-up**: the first version of the seed called `completeOnboarding()`, which bumps `preferencesUpdatedAt` — for verified users the sync subscription then pushed default prefs over their real cloud doc on every reload. Fixed to `setState({ onboardingComplete: true })` (no clock bump → no push), with a 3-test regression suite (`preferencesStore.test.ts`) locking the invariant, and redeployed | Emulator harness audit-1: "Onboarding not re-shown after reload" + "Sign-in skips onboarding" PASS; clobber probe (sign in verified, set currency USD, reload → cloud doc still USD, onboarding skipped) 3/3 PASS; after redeploy, live smoke 10/10 + prod audit 11/11 PASS on aus01.web.app |
| 3 | **Release pipeline never launched the release APK** — CI only built + apksigner-verified it; the documented R8-strip crash class would still ship (AGENTS.md: "assembleProdRelease succeeding proves nothing") | `release.yml` now boots an API-29 emulator, installs the signed release APK, launches MainActivity, and fails the release if the process dies within 12s (logcat dumped on failure) | Workflow reviewed; change is CI-config (runs on next tagged release) |

## Verified working (no change needed)

- ~~**Category reordering (the AGENTS.md "known open")** — device-verified on AVD against the emulator backend...~~ **Correction, same day:** this was premature. AVD test data doesn't carry the legacy `cloudId` / Timestamp `updatedAt` / `deleted` field drift a real account has, and reordering was still broken against one. Three bugs found and fixed testing against the real account instead: a genuine concurrency race in `moveCategory` (fixed with a busy-guard + atomic batch write), a regression that fix introduced (a cached read that's only warm on one of the two screens reordering is reachable from), and the actual blocker — `validCategory()` never tolerated the legacy fields real category documents carry, so any write to one was rejected outright. See AGENTS.md section 1 (incident table) and section 3 for the full account.
- **Firestore rules** — writer-vs-rules matrix checked field-by-field for both clients: expense/category/preferences/meta payloads, legacy-field tolerance (cloudId/categoryCloudId/receiptImagePath/deleted, number-or-Timestamp updatedAt), category-exists + type-match enforcement, `accountDeletionPending` escape hatch is owner-scoped only (no mass-delete bypass).
- **Auth** — email verification enforced server-side on all mutations (mirrored client-side by both apps); account wipe = reauth → marker → batched wipe → auth delete; App Check initialized on both platforms and intentionally unenforced (harmless 403 + 24h throttle in headless, as documented).
- **Secrets** — HEAD tracks only `.example` files; git history contains an old scaffold `google-services.json` (dummy key) and a historical `web/.env.production` (public web-config values, embedded in every shipped client anyway) — hygiene note, no live credential leak; error-endpoint worker is origin-gated, size-capped, secret-free.
- **Dependencies** — web prod deps 0 known vulns; 7 moderate findings are dev-only (firebase-tools transitive, not shipped); `brace-expansion` override still justified; Android runtime tree clean.
- **Live production (unverified-only, per user decision)** — smoke 10/10; sign-in reaches the real backend; sign-up lands on real Auth; unverified writes correctly blocked with friendly error; account-wipe flow deletes the throwaway account; API-key referrer restriction active (blocks localhost).
- **Android on-device** — debug APK launches clean, sign-in, transaction write, settings/category flows all work against the emulator backend.

## Findings intentionally left as-is

- **Unverified-user preferences volatility** (web): everything except theme + onboarding is cloud-only until email verification — locale/currency/budget set pre-verification are lost on reload. Matches the documented "local-only theme/locale until confirm" design; noted, not changed.
- **Escape/backdrop on a pristine add-transaction sheet shows the discard-confirm** — category is always preselected so every pristine sheet counts as "has draft" (Android parity per code comment).
- **Two empty unverified throwaway accounts** (`prod-audit-*@test.local`) remain in production Auth from runs where cleanup couldn't run (no data; removable from the Firebase console).
- **Vite chunk warning**: firebase bundle 660 kB (>500 kB) — performance note, not a failure.
- **Android lint**: `POST_NOTIFICATIONS` not API-guarded at MainActivity.kt:133 (device run confirmed the permission flow works; @TargetApi guard could silence lint), `OldTargetApi` targetSdk 36 < compileSdk 37.
- **Git history hygiene**: the historical `web/.env.production` values could be rotated if strictness is wanted.

## Final gate results (all green)

- Web: unit 62 · lint · lint:css (454 tokens) · build · rules 37 · emulator repo 39
- Android: `./gradlew test` (78 tests) · lintProdDebug · assembleProdDebug · assembleProdRelease (R8, versionCode 10203)
- Emulator Playwright harness: 78 PASS / 0 FAIL (auth, transactions, record, categories, insights, settings, budget)
- Live: smoke 10/10 · prod audit 10/10 post-deploy
