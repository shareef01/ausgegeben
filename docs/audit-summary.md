# Audit summary

Newest first. Every item is verified against the real artifact, not just by reading code — per AGENTS.md section 1. Where something could not be verified that way, it says so.

---

# 2026-08-28 — audit of the post-v2.0.0 UI refactor

Audit of the one commit that landed after the 2026-08-27 audit and release:
`c1dc449` *"refactor(ui): consolidate design tokens, theme accents, and accessibility
semantics"* — Android-only, 6 files. All gates re-run and production re-checked.
Working tree was clean at start (`c1dc449`), nothing unshipped besides that commit.

## Findings

| # | Finding | Fix | Verified how |
|---|---|---|---|
| 1 | **HIGH — the local release keystore is not the release key.** AGENTS.md §3 claimed the "no signed release can be built here" warning was obsolete. The local `ausgegeben-release.jks` is `CN=Test, OU=Test, O=Test`, generated 2026-08-27 05:27; the published `v2.0.0` APK is signed `CN=Ausgegeben, O=shareef01`. A locally signed APK cannot install over a released build | AGENTS.md §3 corrected: local signing is **build coverage only** (R8/packaging), never distributable; check the DN rather than trusting "apksigner verified the cert" | `keytool -list -v` on the local store vs `apksigner verify --print-certs` on the `v2.0.0` APK downloaded from GitHub Releases — different DNs |
| 2 | **MED — `c1dc449` reinstated the touch-target regression `353da22` had fixed.** It rebuilt the move-up/move-down/edit/delete cluster in the manage-categories *sheet* (`CategoryManageRow`) out of `AppIconButton(modifier = Modifier.size(44.dp))`, replacing Material3 `IconButton` (48dp). `AppIconButton` applied its own `.size(48.dp)` *after* the caller's modifier, so the caller won | The 48dp floor now goes **before** the caller's modifier (`sizeIn(min = 48.dp).then(modifier)`), so no call site can shrink it; the seven now-ineffective size overrides removed | Compose test on the AVD reproducing the exact call-site shape: **44.19dp** measured against a 48dp floor before the fix |
| 3 | **MED — a 20dp touch target** (pre-existing): the note-field clear button, `AddTransactionScreen.kt` | Covered by the same floor. The decoration `Row` gained `heightIn(min = 48.dp)` so gaining a 48dp button on the first keystroke cannot reflow the field | Same probe: **20.19dp** measured before the fix |
| 4 | **MED — `TouchTargetTest` could not catch either, by construction.** All five cases build `AppIconButton` with no modifier, so they measure the component default and never a call site — including the case whose own KDoc names this cluster. 5/5 green while two call sites were undersized | Sixth case added: passes `size(44.dp)` and `size(20.dp)` and asserts the floor holds anyway | Fails against the old component, passes against the new |
| 5 | **MED — the deployed error worker received nothing.** The worker README lists three wiring steps; the CSP allow-list and the redeploy were done on 2026-08-27, but `VITE_ERROR_REPORT_URL` was never set, so `installConfiguredErrorSink()` returned false and the PWA stayed console-only. `npm run smoke` records this as a *soft* pass — "error endpoint not configured (skipped)" — so it still read 10/10 | Added to `web/.env.production` (gitignored) and documented in `.env.example` | Endpoint re-probed live: preflight **204** with matching `Access-Control-Allow-Origin`, forged origin **403**. Deployed same day; smoke now reports **"error endpoint accepts this origin" HTTP 204** in place of the skip, and the live bundle carries the URL |
| 6 | **LOW — `AppSpacing` values were redefined, not just extended** (`lg` 32→24, `xl` 48→32, `xxl` 64→48). The six edited files remapped their literals so they look unchanged, but four call sites in *unedited* files shifted silently: both `AppButton`/`AppOutlinedButton` horizontal padding (every button in the app), an `IosSurfaces` row, and the `BillsScreen` footer spacer | Restored the original dp at those four sites via the retitled tokens, keeping the refactor visually neutral as intended | Cosmetic only — vertical padding and `defaultMinSize` untouched, so no touch-target impact |

## Checked and clean

`AppButton`'s content slot is `RowScope`, so the `Icon`+`Spacer`+`Text` conversion lays
out correctly · `navigationBarsPadding()` matches the existing sheet convention
(`IosSurfaces`, `SettingsScreen`) · `SignatureText` lowercasing is house style across 8
call sites, and `resolvedTitle` is always a static localized string — neither caller
passes user data as `title`, so no category name is lowercased · the `RecordScreen`
day-total `contentDescription`s are a genuine improvement · keystore and `.env` files
untracked, gitignored, and absent from history.

## Gate results

Android unit **116/116** · `lintProdDebug` clean · instrumentation on the AVD **9/9**
(ExportFileProvider 2, MainActivityLaunch 1, TouchTargetTest 6 — including the new
floor case, which fails against the old component and passes against the new) · web
unit **69/69** · `tsc` clean · `lint:css` 454 tokens · `npm run build` 40 precache
entries · production smoke **10/10** on `aus01.web.app` with the API key live · error
worker re-probed live (preflight 204 with matching ACAO, forged origin 403).

## Incident — this run wiped the app off the user's phone

`connectedProdDebugAndroidTest` targets **every** attached device. The user's Pixel 7
was plugged in (it was not at the start of the session, and I did not re-check before
running), so Gradle ran the suite there as well as on the AVD. To get past the
signature conflict with the release-signed v2.0.0 it uninstalled that build, installed
the debug APK, ran the tests, and uninstalled afterwards — leaving **no app and no
local data** on the phone. `pm list packages -u` shows no retained-data record either.

Lost: DataStore prefs (theme, locale, currency, monthly budget), onboarding state, and
the signed-in session. Firestore data is cloud-side and untouched, so reinstalling
v2.0.0 from GitHub Releases and signing in restores everything except those local prefs.

The six Pixel failures were unrelated to the change under test: all six Compose cases
died at setup with `IllegalStateException: Exception handler was not found via a
ServiceLoader` (kotlinx.coroutines) on that device, while the three non-Compose cases
passed. Every touch-target number quoted above is the AVD's.

AGENTS.md §4 warned against *driving* the phone. It now also says to pin
`ANDROID_SERIAL` before any connected task — a task that fans out to all devices is a
different hazard from a stray tap, and this one cost real data.

## Shipped

- **v2.0.1** — tagged from `f4e347b`, CI release green. Verified against the published
  artifact rather than the green check, per finding 1: signer DN `CN=Ausgegeben,
  O=shareef01` with cert SHA-256 `24539f14…77ee`, byte-identical to v2.0.0's signer and
  **not** the local `CN=Test` key; versionCode 20001. R8 ran and the emulator launch
  gate passed on the signed APK — the first time `c1dc449` or any of today's fixes has
  been through the gate AGENTS.md §1 considers predictive.
- **Web** — `npm run deploy` (hosting + rules + indexes), smoke **10/10**, including
  the endpoint check that had been skipping since the worker went up.
- **Phone** — v2.0.0 reinstalled from the CI-signed release APK after the incident
  above (versionCode 20000 confirmed on device). Not driven or signed in.

## Not verified

- The user's phone was left on **v2.0.0**, not v2.0.1, and its local prefs (theme,
  locale, currency, monthly budget) are gone for good — see the incident above. No
  reinstall restores them.
- The category cluster and the note field were **not** driven by hand on the AVD; the
  48dp result is from a Compose test reproducing the call-site shapes. The cluster's
  width is back to exactly what it was before `c1dc449` (Material3 `IconButton` was also
  48dp), so the row layout is a restoration, not a new arrangement.
- Web emulator-backed suites (rules 38, emulator 44) were not re-run — no web source
  changed, only `.env`.

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

- The user's sign-in was confirmed, and **the budget warning fired** on the real account the same day (v2.0.0, real expense added with a budget set) — the check AGENTS.md §3 calls the only one worth anything, re-confirming at v2.0.0 that both aggregation composites serve. What was *not* re-verified: the new per-doc fallback paths (type change, dedupe repairs), which still have no trigger in any known real data.
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
