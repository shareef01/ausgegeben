# Ausgegeben — Exhaustive Production-Grade Audit

**Audited tree:** working tree on top of `4fafb98f3a76b79caeff12bc534c4393549df902` (branch `main`)
**Audit date:** 2026-08-31
**Auditor roles:** principal engineer · application-security · data-integrity · release engineering · adversarial QA

> **Baseline caveat that shapes this whole report.** `git rev-parse HEAD` is `4fafb98`, but the
> working tree is **not clean**: 46 tracked files are modified, 1 deleted, and 13 paths are
> untracked (1,018 insertions / 299 deletions). That uncommitted diff is the remediation for the
> previous audit (`AUDIT.md`, also untracked). **I audited the working tree**, because that is what
> would ship — and because AGENTS.md §1 records that the *fix* for a finding has itself shipped a
> new bug before. Several findings below are defects in that uncommitted remediation.
>
> Nothing in production today runs this tree: the deployed bundle is `index-BlkU3QNp.js`, my local
> build of the working tree is `index-B9eJMEGq.js`.

---

## 1. Executive Summary

Ausgegeben is a genuinely well-defended two-client personal-finance app on Firebase Spark. The
Firestore rules are the real security boundary and they hold: per-user isolation is structural,
schema validation is tight, and legacy-shape tolerance is written against *measured* document
shapes rather than guessed fixtures. The money model is sound — sign is carried by
`transactionType` rather than by signed amounts, so the classic "expense counted as income" family
cannot occur, and every aggregation boundary rounds deliberately. Every one of the nine historical
incidents in AGENTS.md has a working, verifiable guard; I confirmed the two hardest ones at
artifact level (R8 keep rule, release certificate pin) rather than taking the docs at their word.

What holds this back is not the application logic. It is **three silent-failure paths**: a web edit
form that rewrites a category the user never touched, a production web build whose most important
configuration value is checked by nothing at all, and a set of one-shot markers that make future
remediation unreachable on exactly the accounts that need it.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | **1** |
| Medium | 7 |
| Low | **10** |

> **Correction (post-write).** This report originally filed two High findings. **AUS-102 was
> wrong and is retracted** — I filed it without reading `web/vite.config.ts`, which already
> guards the case at build time; I then falsified my own claim by test. See §4. The counts
> above are the corrected ones.

### Top five risks

1. **AUS-101 (High)** — Editing a transaction that sits in Uncategorized silently refiles it under
   a different category. Reachable by the ordinary "delete a category" journey. Android blocks the
   same save; web does not.
2. **AUS-105 (Medium)** — Category reordering is one all-or-nothing batch with no per-document
   fallback, so a single legacy category the rules refuse permanently disables reordering.
3. **AUS-106 (Medium)** — `meta/dedupe.orphansScannedAt` carries no version. Historical incident #8
   was *caused* by this marker already being set; the design that caused it is unchanged, so any
   future orphan-repair improvement can never run on an existing account.
4. **AUS-104 (Medium)** — Android account deletion leaves the local Firestore cache and all
   preferences on the device. Web clears both. Sign-out is more thorough than deletion.
5. **AUS-107 (Medium)** — Web does not record the orphan scan when it throws, so a failing scan
   re-reads the whole expenses collection on every cold start — a self-sustaining Spark quota loop.

### Strongest parts of the system

- **Firestore rules.** Cross-user access is structurally impossible; the legacy allowlists are
  bounded by type *and* size rather than waved through; `updatedAt` accepts number *or* Timestamp;
  note/name caps use `<=` so an at-cap client write is not rejected server-side. 48 rules tests pass.
- **Release pipeline.** Three test gates before build, every third-party action pinned to a commit
  SHA, keystore shredded before third-party steps run, certificate **identity** pinned (not just
  "some valid signature"), and the signed APK is actually launched on an emulator.
- **The batch-rejection defence.** `reassignExpenses` / `updateExpenseTypesForCategory` retry a
  rejected batch one document at a time so healthy rows still land — historical incident #2, fixed
  properly, in both clients.
- **Honest instrumentation.** `listenerError` is tracked per source, `dataTruncated` is reported by
  the listener that can actually see truncation, and the smoke test turned a soft pass into a hard
  failure precisely because a soft pass once hid a dead endpoint.

### Biggest blind spots

- **No signed-in device evidence.** No Android device was attached and AGENTS.md §4 forbids
  fanning out to a possibly-present phone. Every Android UI claim here is static or unit-level.
- **Local-only web deploy.** Hosting is deployed by hand from a machine holding the only copy of
  `.env.production`. CI never builds or validates the production bundle's configuration.
- **Legacy document shapes.** I may not read real user documents, so claims about what fields real
  rows carry rest on the rules allowlists and AGENTS.md's recorded measurements, not observation.

---

## 2. Verification Performed

| Check | Command / method | Result | What it proves | What it does **not** prove |
|---|---|---|---|---|
| Baseline | `git rev-parse HEAD`, `git status --short` | `4fafb98`, 46 M / 1 D / 13 ?? | The audited tree is dirty; HEAD ≠ what ships | Nothing about correctness |
| Web unit tests | `npm test` | **85 passed / 15 files** | Pure logic: money, periods, CSV, i18n, LWW | Nothing about rules, indexes, or the browser |
| Web typecheck | `npm run lint` (`tsc --noEmit`) | exit 0 | No type errors | Types ≠ runtime behaviour |
| CSS utility lint | `npm run lint:css` | OK — 459 tokens, 0 undefined | No inert hand-written utility classes | Not visual correctness |
| Web prod build | `npm run build` | built in 9.3s; PWA precache 40 entries | Bundles, code-splits, SW generated | Not that the bundle *boots* (see AUS-102) |
| Rules tests | `npm run test:rules` (emulator, JDK 21) | **48 passed** | Rule branches behave as written | Emulator ≠ production: it invents indexes and does not enforce access-call limits |
| Repository tests | `npm run test:emulator` | **44 passed** | Dedupe, delete, orphan repair, batch chunking against real Firestore semantics | Same emulator caveats |
| **Audit probe (temporary, reverted)** | 4 custom rules tests vs emulator | **4 passed** | Orphan un-editability, repair path, `'0'` sentinel semantics, unverified self-authorized delete — all **emulator-confirmed** | Production rules deployment state |
| Production smoke | `npm run smoke` | **11/11 passed** | Live site serves, CSP + HSTS present, API key alive, SW uncacheable, error endpoint reachable and CORS-allowed | Does **not** execute JS; cannot see a white screen; does not check the App Check key |
| Asset security headers | `curl -sI` on `/assets/index-*.js` | CSP, HSTS, XCTO, XFO, Referrer-Policy, Permissions-Policy all present | Firebase applies **all** matching header blocks — headers are not `/`-only | — |
| Deployed bundle config | `curl` bundle, grep for `6L…` / `AIzaSy…` / `workers.dev` | All three present | Production is correctly configured **today** | Says nothing about the next build |
| Dependency audit | `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** | Shipped browser code is clean | — |
| Dependency audit (all) | `npm audit --json` | 7 high / 8 moderate, **all dev-only transitives** | Build tooling only; not in the bundle | — |
| Android unit tests | `./gradlew testProdDebugUnitTest --rerun-tasks` | **146 passed, 0 failures** (24 classes) | Genuinely executed — the first run reported `UP-TO-DATE` and proved nothing | Not UI, not release, not device |
| Android lint + debug APK | `./gradlew lintProdDebug assembleProdDebug` | BUILD SUCCESSFUL | Manifest/config sane; debug packages | Debug never runs R8 |
| **R8 release build** | `./gradlew assembleProdRelease` | BUILD SUCCESSFUL in 4m 57s | R8 + resource shrinking complete on this tree | Build gate only — **no launch evidence** |
| **R8 keep rule (artifact-level)** | `mapping.txt` → `WorkDatabase_Impl` | `void <init>():45:45 -> <init>` retained, class unrenamed | Historical incident #1's guard is genuinely load-bearing | Not that the app launches |
| Local release signing identity | `apksigner verify --print-certs` | `CN=Test, OU=Test, O=Test` · `5009409a…` | AGENTS.md §3 is correct: the local keystore is a throwaway | — |
| **Published release certificate** | `gh release download v2.0.2` + `apksigner` | `CN=Ausgegeben, O=shareef01` · `24539f14…77ee` — **exact match** to `.github/release-cert.sha256` | The pinned fingerprint is correct and would reject the local throwaway key | — |
| Published versionCode | `aapt2 dump badging` | `versionCode='20002' versionName='2.0.2'` | The tag→versionCode derivation works in the real CI release | — |
| i18n key parity (web) | key-set diff `en.ts` ↔ `de.ts` | 290 / 290, **0 missing either way** | Complete web translation coverage | Not translation quality |
| i18n key parity (Android) | key-set diff `values` ↔ `values-de` | 329 / 329, **0 missing either way** | Complete Android coverage | Not translation quality |
| CSP vs inline styles | grep source + built bundle | 0 `style={{}}`; only Firebase's redirect-iframe helper | `style-src` without `'unsafe-inline'` is safe here | — |
| Instrumentation tests | **not run** | `adb devices` empty | — | AGENTS.md §4: absence now is not evidence of absence later. 3 test classes unexercised here |
| Signed-in device workflows | **not run** | No device; forbidden | — | Everything behind sign-in on Android is unverified |

**Test totals measured:** 146 Android unit + 85 web unit + 48 rules + 44 emulator = **323**.
README.md line 169 claims 323. **Accurate** — the previous `AUS-015` drift is closed.

---

## 3. Critical Findings

**None.** No cross-user data access, no authentication or authorization bypass, no remote
destructive deletion, no exposed signing or private credentials, and no guaranteed irreversible
widespread data loss was found. Cross-user access is structurally impossible in `firestore.rules`:
every subcollection match requires `isOwner(userId)`, the parent `users/{userId}` document is
`allow read, write: if false`, and no collection-group query exists anywhere in either client.

---

## 4. High Findings

### [AUS-101] Editing an Uncategorized transaction on web silently refiles it under a different category

**Severity:** High
**Confidence:** High
**Status:** Statically proven (web), emulator-confirmed for the enabling rules behaviour, cross-checked against Android

**Affected:**
- `web/src/viewmodels/useAddTransactionViewModel.ts:98-102` — the offending effect
- `web/src/viewmodels/useAddTransactionViewModel.ts:94` — `filteredCategories` excludes `UNCATEGORIZED_ID`
- `web/src/repositories/expenseRepository.ts:475` — `deleteCategory` reassigns linked rows to `'0'`
- `app/src/main/java/com/aus/ausgegeben/ui/AddExpenseViewModel.kt:108,124` — Android's safe counterpart

**Scenario:**
1. User deletes a category on web. `deleteCategory` repoints every linked transaction to the
   Uncategorized sentinel `categoryId: '0'` (this is the designed, correct behaviour).
2. User later opens one of those transactions to fix its amount or note.
3. `filteredCategories` deliberately excludes `'0'`, so `form.categoryId === '0'` is not in the list.
4. The effect below fires on mount and rewrites it.

**Evidence:**
```ts
useEffect(() => {
  if (!filteredCategories.some((c) => c.id === form.categoryId)) {
    setForm((f) => ({ ...f, categoryId: filteredCategories[0]?.id ?? null }));
  }
}, [form.transactionType, filteredCategories, form.categoryId]);
```
The effect exists to reset the category when the user switches transaction *type*. It cannot tell
"the user changed type" from "this transaction's category is the sentinel or an orphan", so it
treats both identically. `save()` then writes `categoryId: form.categoryId` with no further check.

This is not a hypothetical: the repository's own comment at
`web/src/repositories/expenseRepository.ts:322-324` records that this exact behaviour was observed
— *"On web the edit form then silently re-pointed them at whatever category happened to be first,
quietly changing the user's categorisation."* The mitigation applied at the time was to stop
`ensureSeeded` deleting the sentinel while referenced. **The root cause in the edit form was never
fixed**, and the sentinel path is not the only trigger — any orphan reaches it too.

**Reproduction (safe, throwaway account):**
1. Sign in on web with a verified throwaway account; create category "Coffee" (expense) and a
   €4.50 transaction in it.
2. Settings → Categories → delete "Coffee". The transaction moves to Uncategorized.
3. Record → tap that transaction → change nothing but the note → Save.
4. Read the document: `categoryId` is now the first expense category by `sortOrder`, not `'0'`.

**Expected:** Editing an unrelated field leaves `categoryId` untouched; if the current category is
unselectable, the form should say so and require an explicit choice.
**Actual:** `categoryId` is silently rewritten to `filteredCategories[0].id` and persisted.

**Impact:** Silent modification of stored financial data the user did not touch. Category totals,
the donut chart and the category breakdown all become wrong, and there is no audit trail or undo.
Amount and type totals are unaffected — this is attribution corruption, not arithmetic corruption.
It compounds: every Uncategorized transaction the user opens gets absorbed into whichever category
happens to sort first.

**Root cause:** One effect serves two distinct concerns — "reset category because the type changed"
and "the stored category is not selectable" — and resolves the second by guessing rather than asking.

**Why existing tests/CI miss it:** There are no React component or hook tests in the suite at all
(`web/src/**/*.test.ts` are 15 pure-logic files; no `.test.tsx`, no React Testing Library
dependency). The rules accept the write because the target category is valid — this is a client
logic defect the server cannot see. Emulator tests exercise the repository, never the view model.

**Recommended fix (smallest robust):** Keep the reset keyed to an actual type change, and treat an
unresolvable stored category as an explicit error state rather than a silent substitution:
```ts
const prevType = useRef(form.transactionType);
useEffect(() => {
  if (prevType.current === form.transactionType) return;   // only on a real type change
  prevType.current = form.transactionType;
  setForm((f) => ({ ...f, categoryId: filteredCategories[0]?.id ?? null }));
}, [form.transactionType, filteredCategories]);
```
plus, on load, if `existing.categoryId` is not in `filteredCategories`, surface
`t('errorChooseCategory')` and leave `categoryId` as-is so `save()`'s existing
`if (!form.categoryId)` guard blocks the write — which is exactly Android's behaviour.

**Regression test:** `web/src/viewmodels/useAddTransactionViewModel.test.tsx` — load an expense with
`categoryId: '0'` while categories `['a','b']` exist; assert `save()` does **not** write a
`categoryId` different from `'0'`, and that an error is surfaced instead. (Requires adding
`@testing-library/react`.) A cheaper non-React alternative: extract the resolution into a pure
`resolveEditCategory(storedId, selectable, typeChanged)` and unit-test that.

**Cross-client implications:** Android is correct and needs no change — `loadForEdit` sets
`_selectedCategory` to `null` when the id is not found, and `saveExpense` refuses with
`error_select_category`. This is a one-sided web defect, so the two clients currently disagree
about what editing an Uncategorized transaction does.

**Production verification after fix:** On a throwaway account, repeat the reproduction and confirm
the document's `categoryId` is unchanged after saving an edit to the note.

---

### [AUS-102] ~~A web build missing the App Check key white-screens production and passes build, deploy and every smoke check~~ — **RETRACTED, see below**

> ## ⚠ This finding was wrong. Corrected 2026-08-31, after the report was first written.
>
> I filed this from `web/src/services/firebase.ts` alone and did not check
> `web/vite.config.ts`, which **already contains a build-time guard** (lines 8–16). I then
> tested both failure paths rather than reasoning about them, and both are caught:
>
> ```
> $ VITE_FIREBASE_APP_CHECK_KEY= npx vite build --mode production
> error during build:
> Error: VITE_FIREBASE_APP_CHECK_KEY is required for production builds when Firebase is configured.
> EXIT=1
> ```
>
> ```
> $ VITE_FIREBASE_API_KEY= VITE_FIREBASE_APP_CHECK_KEY= npx vite build --mode production
> ✓ built in 12.79s          EXIT=0
> $ grep -c 'AIzaSy…\|6L…' dist-probe/assets/index-*.js   →  0
> ```
>
> - **API key present, App Check key missing** → the build **fails**. It can never deploy.
>   This is the exact case that would have thrown in the browser, and it is blocked.
> - **`.env.production` lost entirely (both missing)** → the build succeeds, but the bundle
>   contains no API key, so `smoke.mjs`'s existing `Firebase API key found in bundle` check
>   **hard-fails**, and `npm run deploy` runs smoke immediately after deploying.
>
> So there is no path by which a non-functional bundle ships undetected. **Severity: Low
> (informational).** The residual observation still worth something is narrow: the App Check
> key's presence was only ever implied by the *other* key's guard, never asserted directly.
> I added that assertion to `smoke.mjs` as defence-in-depth — it costs one regex and makes
> the requirement explicit — but it closes a gap that was already closed by other means.
>
> The one genuinely actionable part of the original finding survives and is unrelated to the
> guard: **`web/.env.production` is gitignored, single-copy, unbacked-up state on one
> machine, and the web deploy runs only from there.** Losing it means a rebuild produces a
> dead bundle (caught by smoke, but only after a live deploy) and the five values must be
> re-derived from the Firebase Console. That belongs in AGENTS.md §4, not in a High finding.
>
> Corrected counts after this retraction: **High 1, Medium 7, Low 10.**

**Severity:** ~~High~~ → **Low**
**Confidence:** ~~High~~ → the original reasoning was unsound
**Status:** **Retracted** — falsified by direct test

**Affected:**
- `web/src/services/firebase.ts:55-61` — the fail-closed `throw`
- `web/.env.production` — gitignored, the only copy of five production values
- `web/scripts/smoke.mjs:70-90` — checks the API key, not the App Check key
- `web/package.json:"deploy"` — deploy runs locally; no CI job deploys hosting

**Scenario:** Any production build performed without `web/.env.production` present — a fresh clone,
a rebuilt machine, a second contributor, a CI-based deploy added later.

**Evidence:**
```ts
} else if (import.meta.env.PROD) {
  throw new Error('[firebase] VITE_FIREBASE_APP_CHECK_KEY is required in production. …');
}
```
Vite substitutes a missing `import.meta.env.VITE_*` with `undefined`/empty **at build time without
failing the build**. The `throw` therefore fires in the *browser*, on the first call to
`getFirebaseApp()` — which every auth and Firestore path funnels through. So:

- `npm run build` → succeeds (verified: my build succeeded with the key present; the code path is
  unconditional on `PROD` and independent of build success).
- `firebase deploy` → succeeds.
- `npm run smoke` → **passes 11/11**. It fetches `/`, checks for `<div id="root">`, checks headers,
  fetches the bundle and probes the *API* key against identitytoolkit. It never executes the
  bundle, and it never looks for the reCAPTCHA site key. Its own header comment concedes: *"It
  cannot catch a render-time white screen."*

I confirmed the check is trivially feasible — the key is a single, greppable `6L…` token, exactly
like the `AIzaSy…` token the script already probes:
```
$ curl -s https://aus01.web.app/assets/index-BlkU3QNp.js | grep -c '6L[A-Za-z0-9_-]\{20,\}'
1
```

**Expected:** A build that cannot possibly work in production fails at build time, or is caught
before or immediately after deploy.
**Actual:** Every gate is green and the site is dead for all users.

**Impact:** Total web outage — no sign-in, no data, blank page. This is historical incident #4
(*"Web API key silently deleted → sign-in broken for everyone … Deploys keep succeeding; nothing
validated the key"*) with a different variable name. AGENTS.md §28 explicitly asks for siblings of
that incident; this is one, and it is worse, because the key's only copy is untracked and
unbacked-up.

**Root cause:** A runtime fail-closed guard for a build-time input, plus a smoke test whose
coverage was extended to the one key that had failed before rather than to the class of
build-time configuration.

**Why existing tests/CI miss it:** CI never builds with production env files and never deploys
hosting. Smoke does not execute JavaScript.

**Recommended fix (two lines, no new dependency):**
1. In `web/scripts/smoke.mjs`, alongside the existing API-key probe, hard-fail on production when
   the bundle contains no reCAPTCHA site key:
   ```js
   const appCheckKey = (bundle.match(/6L[A-Za-z0-9_-]{20,}/) || [])[0];
   record(Boolean(appCheckKey), 'App Check site key is baked into the bundle',
     appCheckKey ? '' : 'VITE_FIREBASE_APP_CHECK_KEY missing at build time — the app throws on boot',
     !IS_PRODUCTION);
   ```
2. Fail the **build**, not the browser: add a `vite.config.ts` check that throws during
   `buildStart` when `mode === 'production'` and the variable is empty. A build-time failure is
   strictly better than a runtime one for a build-time input.
3. Record in `AGENTS.md` §4 that `web/.env.production` is unbacked-up single-copy state, and where
   the five values can be re-derived (Firebase Console → App Check / Project settings).

**Regression test:** Add a smoke self-test fixture asserting the new check fails on a bundle string
with no `6L…` token. The real proof is running `npm run smoke` after each deploy — which
`npm run deploy` already does.

**Cross-client implications:** Android is unaffected — it reads `google-services.json`, and
`app/build.gradle.kts` already **fails the release build** on a placeholder config. That Android
guard is the correct pattern; the web build lacks its equivalent.

**Production verification after fix:** `npm run smoke` should report 12/12 including the new check.

---

## 5. Medium Findings

### [AUS-103] `.github/release-cert.sha256` is untracked, so the next tag cannot publish a release

**Severity:** Medium · **Confidence:** High · **Status:** Runtime-confirmed (both halves)

**Affected:** `.github/release-cert.sha256` (untracked), `.github/workflows/release.yml:225-243`

**Evidence:** `git ls-files .github/release-cert.sha256` returns nothing, and
`git check-ignore -v` exits 1 with no output — the file is **not ignored, simply not committed**.
`release.yml` runs `actions/checkout` at the tag and reads that path; on a tag pushed now the file
would be absent, `EXPECTED` would be empty, and the job fails with
*".github/release-cert.sha256 does not contain a SHA-256 fingerprint."*

The **value is correct**, which I verified end-to-end rather than assuming:
```
$ gh release download v2.0.2 && apksigner verify --print-certs ausgegeben-2.0.2.apk
Signer #1 certificate DN: CN=Ausgegeben, O=shareef01
Signer #1 certificate SHA-256 digest: 24539f14a0e1462546df65bf8edaaeedadbed7cf7bb9b4c258c5463d9aed77ee
```
— an exact match for the file's contents. I also confirmed the guard has teeth: the locally built
release APK is signed `CN=Test, OU=Test, O=Test` / `5009409a…`, which the pin would reject.

**Impact:** Fail-closed, so no wrongly-signed APK can ship — but the entire distribution channel is
blocked until the file is committed, and the failure is easy to misdiagnose because AGENTS.md §4
still says the file "holds a placeholder" (it no longer does).

**Recommended fix:** `git add .github/release-cert.sha256` before tagging, and correct AGENTS.md §4
to say the value is filled in and verified against v2.0.2. Consider a CI check on `main` that
asserts the file parses to 64 hex characters, so this cannot regress silently.

**Why CI misses it:** No workflow reads the file outside the release job, which only runs on tags.

---

### [AUS-104] Android leaves the local Firestore cache and all preferences on the device after account deletion

**Severity:** Medium · **Confidence:** High · **Status:** Statically proven; cross-client asymmetry

**Affected:**
- `app/src/main/java/com/aus/ausgegeben/ui/SettingsScreen.kt:509-514` — `Success` branch
- `app/src/main/java/com/aus/ausgegeben/data/auth/AuthRepository.kt:94-98` — `signOut()` *does* clean up
- `web/src/services/authService.ts:156-158` — web's correct counterpart

**Evidence:** Android's `signOut()` calls `preferenceManager.clearAccountLocalState()` and
`firestoreClient.clearOfflineCache()`. The account-deletion success path calls **neither** — it
shows a toast and nothing else. The Firebase auth-state listener only assigns `_authUser`
(`AuthRepository.kt:51-53`), so nothing else clears state either. Web, by contrast:
```ts
await deleteUser(user);
usePreferencesStore.getState().resetPreferences();
invalidateAllExpensesCache();
await clearLocalFirestoreCache();
```

**Impact:** After a user explicitly asks to delete their account, a local Firestore cache of their
financial history (capped at ~100 MiB by `FirestoreClient.CACHE_SIZE_BYTES`) and all their
preferences — monthly budget, currency, theme, reminder times — remain on the device. The next
person to register on that device inherits the previous user's settings. Exposure of the cache
itself requires device access plus root or a backup, and `allowBackup=false` closes the backup
route — so this is an erasure-completeness and settings-bleed issue rather than a direct leak.
The inversion is the notable part: **sign-out is more thorough than deletion.**

**Recommended fix:** In the `DeleteAccountOutcome.Success` branch, call the same two cleanup
functions `signOut()` uses (or extract a `clearAllLocalState()` and call it from both).

**Regression test:** `AccountDeletionCoordinatorTest` — assert that a successful `deleteAccount()`
invokes the local-clear collaborator. (Requires threading it through the coordinator, which is the
natural home for it.)

---

### [AUS-105] Category reordering is an all-or-nothing batch with no per-document fallback

**Severity:** Medium · **Confidence:** Medium-High · **Status:** Statically proven; reachability depends on legacy data

**Affected:**
- `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:381-393` — `updateCategoriesBatch`
- `web/src/repositories/expenseRepository.ts:439-455` — same shape
- Contrast: `AppRepository.kt:718-742` `reassignExpenses` — *has* the fallback

**Evidence:** Both clients commit the whole renumbered type in one batch with no recovery:
```kotlin
firestore.runBatch { batch ->
    categories.forEach { category ->
        val sanitized = CategoryValidator.sanitize(category.name)
        val c = category.copy(name = sanitized.ifBlank { category.name.trim().take(80) })
        batch.set(catDoc(u, c.id), categoryPayload(c), SetOptions.merge())
    }
}.await()
```
`categoryFromDoc` defaults a missing `name` to `""` and a missing `iconName` to `"shopping_bag"`,
but a field that is **present and empty** passes straight through. `validCategory()` requires
`name.size() > 0` and `iconName.size() > 0`, and `transactionType in ['expense','income','transfer']`.
Any one category failing any of those rejects the **entire** batch, so **no** category in that type
can ever be reordered again. The user sees `category_error_reorder_failed` /
`categoryErrorUpdateFailed` with no indication of which row is at fault and no in-app repair.

This is the same failure shape as historical incident #2 (*"One rules-rejected document aborted a
whole 450-doc batch"*), and the codebase already solved it correctly for expenses — the asymmetry
is the finding. Note that a naive per-document retry would be **wrong** here: partial renumbering is
worse than either order, which is exactly why the batch exists.

**Recommended fix:** Validate before batching rather than retrying after. Filter the input through
the same predicate the rules use, and if any category in the type fails it, refuse the reorder with
a *specific* message naming the offending category and offering repair (the manage-categories sheet
can already rename it). Optionally normalise a blank `name`/`iconName` to the defaults
`categoryFromDoc` already substitutes, which would repair the row on first reorder.

**Regression test:** `web/emulator/` — seed a category with `iconName: ''` alongside three healthy
ones, call `updateCategoriesBatch`, and assert the healthy rows' `sortOrder` are unchanged *and*
that the caller receives an identifying error rather than a generic one.

---

### [AUS-106] The one-shot orphan-scan marker has no version, so future remediation can never run on existing accounts

**Severity:** Medium · **Confidence:** High · **Status:** Statically proven; historical repeat-offender

**Affected:**
- `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:240-243` — `!marker.contains("orphansScannedAt")`
- `web/src/repositories/expenseRepository.ts:310-317` — `typeof marker?.orphansScannedAt !== 'number'`
- `firestore.rules` `validDedupeMarker()` — allowlist has no version field

**Evidence:** Both clients gate the sweep on the mere *presence* of `orphansScannedAt`. Android
writes it **even when repair failed** (`sweepOrphanedExpenses`, deliberately, to avoid re-reading
the whole collection every launch). The marker records "a scan happened once", not "which scan".

AGENTS.md §1 records that this precise design already caused a shipped fix to be unrunnable:
*"The cleanup was gated on `meta/dedupe.orphansScannedAt` being unset — already set on every
account that has cold-started."* The incident is documented as fixed; **the design that caused it
is unchanged.** Any future improvement to orphan repair is therefore dead on arrival for every
account that has ever cold-started — which is all of them.

**Impact:** No user-visible defect today. It is a permanent, silent block on future remediation of
exactly the accounts most likely to need it (long-lived ones with legacy drift). The escape hatch —
the manual "Deduplicate categories" action, which calls `sweepOrphanedExpenses` directly — exists
and works, but requires the user to find and press it.

**Recommended fix:** Store `orphanScanVersion: <int>` alongside `orphansScannedAt` (add it to
`validDedupeMarker`'s allowlist, bounded as a number). Gate on
`marker.orphanScanVersion < CURRENT_ORPHAN_SCAN_VERSION` rather than on presence. Bumping the
constant then re-runs the sweep once per account, at the cost of one full scan — the same cost the
marker was designed to bound, incurred deliberately rather than never.

**Regression test:** Emulator test asserting that a marker with an older version re-runs the sweep
and one with the current version does not.

---

### [AUS-107] Web does not record the orphan scan when it throws, re-reading the whole collection on every cold start

**Severity:** Medium · **Confidence:** High · **Status:** Statically proven; cross-client divergence

**Affected:** `web/src/repositories/expenseRepository.ts:769-784` vs
`app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:294-311`

**Evidence:** Android wraps the repair so the marker is written regardless:
```kotlin
val repair = runCatching { repairOrphanedExpenses(u) }
repair.onFailure { e -> Log.w(TAG, "orphan repair incomplete; recording scan anyway", e) }
…
dedupeMarkerDoc(u).set(marker, SetOptions.merge()).await()
```
Web does not — `const { unfixable, scanTruncated } = await repairOrphanedExpenses(userId);` throws
straight past the `setDoc`, and `ensureSeeded`'s `catch { /* best-effort */ }` swallows it. Web's
own comment claims *"The marker is written even when some rows could not be repaired"*, which is
true for `unfixable > 0` but **false when the scan itself throws**.

**Impact:** On web, a persistently failing scan (quota exhaustion, a transient permission error, a
network failure mid-scan) means every cold start re-reads up to 5,001 expense documents. On Spark's
50,000 reads/day that is ~10 cold starts to exhaust the project's entire daily quota — and quota
exhaustion is itself one of the failure modes that makes the scan throw, so it can self-sustain.
This is precisely the cost the marker exists to prevent.

**Recommended fix:** Mirror Android — wrap `repairOrphanedExpenses` in try/catch, log, and write the
marker in a `finally`. Combine with AUS-106's version field so recording a failed scan does not
permanently foreclose a retry.

**Regression test:** Emulator test that makes the expense query reject and asserts
`meta/dedupe.orphansScannedAt` is still written.

---

### [AUS-108] CI reports success when `GOOGLE_SERVICES_JSON` is absent, silently skipping R8 and all instrumentation

**Severity:** Medium · **Confidence:** High · **Status:** Statically proven

**Affected:** `.github/workflows/ci.yml` — `android` job (`if: steps.firebase_config.outputs.available == 'true'`), `instrumentation` job (same guard), `status` job

**Evidence:** Both the release build (the only place R8 runs) and the entire instrumentation job are
step-level-conditional on the secret being present. A skipped **step** leaves its **job** result
`success`, and the `status` job aggregates job results:
```bash
if [ "${{ needs.android.result }}" != "success" ] || … ; then state=failure; fi
```
So if the secret is ever removed, rotated without updating, or expires, CI stays green with only an
`::warning::`, while:
- R8 / resource shrinking is never exercised — historical incident #1 is a release-only R8 crash;
- all three instrumentation classes (`ExportFileProviderTest` guarding the FileProvider security
  boundary, `MainActivityLaunchTest` guarding the Hilt graph, `TouchTargetTest`) never run.

The comment explains the intent honestly — *"keeps fork PRs green"* — and that intent is right for
forks. The gap is that it applies identically to same-repo pushes to `main`.

**Impact:** A secret disappearing silently downgrades CI from "R8 + instrumentation + unit" to
"unit only", with no failing signal. This is a sibling of historical incident #9 (a configuration
dependency nothing validates).

**Recommended fix:** Keep the skip for forks, require the secret otherwise:
```yaml
if [ -z "$GOOGLE_SERVICES_JSON" ]; then
  if [ "${{ github.event.pull_request.head.repo.fork }}" = "true" ]; then
    echo "available=false" >> "$GITHUB_OUTPUT"
  else
    echo "::error::GOOGLE_SERVICES_JSON is required on same-repo runs"; exit 1
  fi
fi
```

---

### [AUS-109] The error-reporting opt-out is bypassed by the replay buffer

**Severity:** Medium · **Confidence:** High · **Status:** Statically proven — defect in the uncommitted remediation

**Affected:**
- `web/src/services/errorReporter.ts:45-49` — `setErrorSink` replays `recent`
- `web/src/services/errorReporter.ts:56-62` — `reportError` buffers unconditionally
- `web/src/services/errorSink.ts:127-133` — `applyErrorReportingPreference`

**Evidence:**
```ts
export function setErrorSink(next: ErrorSink | null): void {
  sink = next;
  if (!next) return;
  for (const report of recent) emit(report);   // replays everything buffered
}
```
Opting out calls `setErrorSink(null)`, which stops transmission — but `reportError` keeps pushing
every error into `recent` (a 20-entry ring buffer) regardless of preference. The moment the user
re-enables reporting, `installConfiguredErrorSink()` → `setErrorSink(next)` **replays up to 20
errors that were captured while reporting was switched off**, subject only to the sink's own
`MAX_SENDS_PER_SESSION = 10` cap.

**Impact:** An explicit privacy opt-out does not hold retroactively. Errors captured during the
opted-out window — including stack traces and `componentStack` — leave the device on re-enable.
For an app that claims privacy by design, an opt-out that quietly defers rather than suppresses is
a meaningful defect. Note also that the toggle **defaults to on** (`readErrorReportingEnabled`
returns `true` when unset), so first-run reports leave the device before any disclosure.

**Recommended fix:** Clear the buffer when reporting is disabled, and stop buffering while it is:
```ts
export function applyErrorReportingPreference(enabled: boolean): void {
  if (!enabled) { setErrorSink(null); resetRecentBuffer(); return; }
  installConfiguredErrorSink();
}
```
Separately, consider surfacing a one-line disclosure next to the toggle in Settings naming what is
sent (error name/message/stack, path, user-agent) and where it goes.

**Regression test:** `errorSink.test.ts` — disable, `reportError(...)` three times, re-enable, and
assert the transport was called zero times.

---

## 6. Low Findings

### [AUS-110] The Worker throws a 500 on a malformed `at` field
`tools/error-endpoint/src/index.js:53` — `report?.at ? new Date(report.at).toISOString() : null`.
`new Date("x").toISOString()` throws `RangeError: Invalid time value`; I reproduced every throwing
case (`"x"`, `"not-a-date"`, `{}`, `[]`, `"2026-13-45"`, `1e20`) in Node. `summarize()` is not
wrapped, so the request 500s and the report is discarded. The app itself always sends
`at: Date.now()` (a number), so this is reachable by a crafted client, not by the PWA — hence Low.
Fix: `const ts = Number.isFinite(new Date(report?.at ?? NaN).getTime()) ? new Date(report.at).toISOString() : null;`

### [AUS-111] The Worker has no rate limiting and logs several unbounded attacker-controlled fields
`tools/error-endpoint/src/index.js:44-55, 60-95`. `Origin` is correctly documented as *not* a
security boundary, so any non-browser client can send `Origin: https://aus01.web.app` and post
freely. There is no per-IP limit, token, or quota. `message`/`stack`/`userAgent` are length-capped,
but `source`, `name`, `context`, `url` and `release` are **not** capped or sanitised, and `source`
and `name` are interpolated into the log line — so newlines in them forge log entries. Bounded only
by the 16 KiB body cap. Also, `await request.text()` buffers the whole body *before* the size check;
prefer rejecting on `Content-Length` first. Impact is log-integrity and free-tier request
exhaustion (100k/day), not data exposure. Fix: cap and strip control characters from every logged
field, and add a lightweight per-IP counter via `request.headers.get('CF-Connecting-IP')`.

### [AUS-112] Web lets a stored `id` field override the authoritative document id
Seven sites map documents as `{ id: d.id, ...d.data() }`
(`web/src/repositories/expenseRepository.ts:240, 259, 396, 502, 510, 537, 671`). Because the spread
comes **second**, a stored `id` field wins over the document path id. `firestore.rules` explicitly
allowlists `id` on both expenses and categories — strong evidence real documents carry it — and
Android is immune (`expenseFromDoc`/`categoryFromDoc` use `doc.id`). Where the two agree (every
document web itself writes) this is inert; where a legacy row's `id` differs from its path, web
would edit, delete or reorder the wrong document. I could not confirm divergence exists without
reading real user data, which is out of scope — hence Low, but the fix is free and removes the
class entirely: reverse the spread to `{ ...d.data(), id: d.id }`.

### [AUS-113] `moveCategory` latches its busy guard forever if the categories listener errors
`app/src/main/java/com/aus/ausgegeben/ui/CategoryViewModel.kt:166-178` sets `_isReordering = true`,
then awaits `repository.allCategories.first()`. That flow's `addSnapshotListener` callback only
calls `trySend` when `snap != null` (`AppRepository.kt:329-338`); on an error it logs and marks the
listener failed but **emits nothing** and never closes. `first()` therefore suspends indefinitely,
the `finally` never runs, and reordering stays disabled until the ViewModel is recreated. Firestore
serves from cache when offline, so this needs a genuine query error — narrow, but the failure is
permanent-for-the-session and silent. Fix: emit a failure sentinel (or close the flow) on error, or
wrap the read in `withTimeout`.

### [AUS-114] Android CSV exports accumulate in the cache directory under a fixed name
`app/src/main/java/com/aus/ausgegeben/util/ExportUtils.kt` writes
`cacheDir/exports/ausgegeben_export.csv` and never deletes it. The user's complete financial history
therefore persists on disk after every export. `file_paths.xml` correctly exposes only
`cache-path exports/`, the provider is `exported="false"`, the grant is per-share and read-only, and
`allowBackup="false"` — so this is a residency issue, not an exposure one. Fix: delete on a
subsequent launch, or write to a `createTempFile` and clean the directory before each export.

### [AUS-115] CSV exports carry no UTF-8 BOM, so Excel on Windows mangles German text
`ExportUtils.kt` (`file.writeText`) and `web/src/utils/analytics.ts:exportCsv` both emit bare UTF-8.
Excel on Windows assumes the ANSI code page for a BOM-less CSV, so "Lebensmittel & Getränke" or a
note containing umlauts renders as mojibake. German is a first-class locale here, and CSV export is
the app's data-portability promise. Both clients are consistent, so this is not a parity defect —
just a portability one. Fix: prefix `﻿` on both sides (and assert it in the existing parity
tests). Note this interacts with nothing else: the formula-injection escaping already applies to
field content, not the file prefix.

### [AUS-116] Release-note generation always falls through to the fallback command
`.github/workflows/release.yml` runs
`--notes-start-tag "$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo '')"`, but
`actions/checkout` defaults to `fetch-depth: 1` and fetches no tags, so `git describe` always fails
and the flag is passed empty. `gh release create` then errors and the `||` fallback (without the
flag) publishes instead. The release still ships; the notes range is just never honoured. Fix: add
`fetch-depth: 0` to the release job's checkout, or drop the first invocation.

### [AUS-117] `formatAmountForInput` renders the same amount differently on each client
Android `DecimalFormat("0.##")` yields `12,5` and `12` for 12.50 and 12.00; web `toFixed(2)` yields
`12,50` and `12,00`. Both feed the amount field when editing an existing transaction, so the same
transaction shows a different string depending on the client. Both re-parse correctly, so no
arithmetic is affected. Fix: change the Android pattern to `"0.00"` to match, and add the case to
`MoneyParityTest` / `moneyParity.test.ts`, which already share `testdata/money-parity.json`.

### [AUS-118] The configured HSTS `max-age` never takes effect
`firebase.json` sets `max-age=31536000`; production serves `max-age=31556926` on both `/` and
assets — Firebase Hosting's own default. The configured value is silently overridden. Functionally
equivalent (both ≈1 year, both `includeSubDomains; preload`), so this is documentation drift, not a
security gap. Worth a comment in `firebase.json` so nobody spends time on the discrepancy again.

---

## 7. Data Integrity Assessment

**Legacy compatibility — strong, and genuinely evidence-based.** `validExpense`/`validCategory`
tolerate `cloudId`, `categoryCloudId`, `receiptImagePath`, `deleted` and accept `updatedAt` as
number *or* timestamp, each bounded by type and size rather than waved through. The rules comments
cite measured counts from a real account (22/89 rows with a Timestamp `updatedAt`; 12/17 categories
with `cloudId`) rather than guesses. `categoryCloudId` explicitly permits `null` *and* `number`,
and `receiptImagePath` permits `null` — the comment records that demanding `is string` would have
frozen 28 more rows than it unfroze. Note caps use `<=` against the clients' exact truncation
limits, so an at-cap client write is not rejected server-side. This is the best-executed part of
the codebase.

**Referential integrity is enforced, and that is a double-edged sword.** I confirmed by emulator
probe that:
- deleting a category makes every expense pointing at it **permanently un-updatable** (any update
  re-evaluates `exists(category)`);
- repointing such an orphan at an existing category **is** accepted, so the repair path works;
- `categoryId == '0'` is exempt from the *type* check but **not** from the `exists()` check — the
  sentinel document must exist for a reassignment to `'0'` to succeed.

Both clients handle this correctly today: `ensureSeeded` deletes the sentinel only once nothing
references it, `deleteCategory` calls `ensureUncategorizedCategory` before reassigning, and both
category-management UIs filter the sentinel out of the deletable list
(`CategoryScreen.kt:60`, `CategoriesView.tsx:87`), so the unconditional
`deleteCategory(UNCATEGORIZED_ID)` branch is unreachable from the UI. That is a defensive path, not
a live bug — but it is one refactor away from becoming one, and it deserves a comment saying so.

**Soft deletion is consistently applied.** I traced every read and aggregation path independently
rather than assuming, because historical incident #5 was exactly this:

| Path | Excludes `deleted` | Where |
|---|---|---|
| Android `getExpensesInRange` | yes | `AppRepository.kt:437` |
| Android `allExpenses` | yes | `AppRepository.kt:601` |
| Android `sumMonthExpenses` | yes — subtracts the deleted subset | `AppRepository.kt:543-548` |
| Android `countExpensesForCategory` | yes | `AppRepository.kt:618` |
| Android `repairOrphanedExpenses` | yes — deliberately skips them | `AppRepository.kt:762` |
| Android `DailyReminderWorker` | yes — client-side, deliberately unlimited | `DailyReminderWorker.kt:52` |
| Android CSV export | yes — via `allExpenses` | `ExportUtils.kt` |
| Web `getAllExpensesCapped` | yes | `expenseRepository.ts:241` |
| Web `getExpensesInRange` / `onExpensesInRange` | yes | `expenseRepository.ts:511, 538` |
| Web `sumMonthExpenses` | yes — subtracts the deleted subset | `expenseRepository.ts:637-640` |
| Web `countExpensesForCategory` | yes | `expenseRepository.ts:551` |
| Web CSV export | yes — via `getAllExpensesCapped` | `analytics.ts:exportCsv` |

`analytics.ts`'s pure functions (`computeTotals`, `groupByCategory`, `computeCashFlowTrend`,
`computeDayTotals`) do **not** filter — correctly, since every caller feeds them pre-filtered data.
That is a real invariant worth an explicit test (see §14).

**Migrations and cleanup.** `reassignExpenses` and `updateExpenseTypesForCategory` both use the
batch-then-retry-singly pattern, so one poison document cannot strand a chunk — historical incident
#2, properly fixed, in both clients. `deleteCollectionBatched` chunks at 400 (under the 500 cap) and
loops until empty in both clients. `ensureSeeded` is mutex-guarded on Android and promise-guarded on
web against concurrent callers. The gaps are AUS-105 (reorder has no equivalent protection),
AUS-106 (marker versioning) and AUS-107 (web marker not written on throw).

One behaviour worth flagging as accepted-but-lossy: both `deleteCategory` and `deduplicateCategories`
delete the category **even when `unfixable > 0`**, logging a warning only. The comment defends this
correctly — a row the rules will never accept must not permanently block a category delete — but the
resulting orphans are then only reachable by the manual dedupe action, and AUS-106 means the
automatic sweep will not find them.

**Account deletion** orders the sequence correctly: reauthenticate → mark `pendingDeletion` → wipe
Firestore → delete the Auth account. The catastrophic state the brief asks about — *Auth deleted,
Firestore cleanup failed, data orphaned beyond the user's reach* — **cannot occur**, because the
wipe precedes the Auth delete. The opposite state (wipe done, Auth delete failed) is handled: the
marker blocks re-seeding, and both clients now offer *both* exits (retry, or keep the account and
clear the marker). One residual gap: if `deleteAllUserData` fails partway, the Firestore marker is
set but `AccountDeletionCoordinator` only sets `pending = true` when `wipe.isSuccess`, so the
in-session banner does not appear until the next launch. Self-healing, low impact.

---

## 8. Security Assessment

**Authentication.** Email/password only; no social providers, no popup/redirect flows. Every
mutation path calls `requireVerifiedEmail()` client-side *and* is gated by `isEmailVerified()` in
the rules. Reauthentication is required before account deletion — correctly, because
`FirebaseUser.delete()` rejects on a stale session and the wipe is irreversible. Errors distinguish
wrong-password from lockout without leaking whether an address is registered.

**Firestore rules — the actual boundary, and they hold.** Cross-user access is structurally
impossible. No field-level read restrictions exist, so there is no query/rules mismatch class here:
`allow read: if isOwner(userId)` permits any query shape the owner can express, and I verified every
production query is owner-scoped. Value bounds are sane (`amount > 0 && < 1e9`, `dateMillis` in
2000–2100, `colorInt` within int32, `sortOrder` 0–9999, themes and periods enumerated). The
preferences LWW clock is bounded to `request.time + 24h`, which blocks the "skew my clock forward
and win every merge forever" attack.

One deliberate weakening is worth naming precisely, and I confirmed it by probe:
**an unverified owner can write `meta/accountDeletion.pendingDeletion = true` without verification,
which then authorises deletes of their own data.** That is the intended wipe path
(`canDeleteOwned = isOwner && (isEmailVerified || accountDeletionPending)`), and the blast radius is
strictly the attacker's own account — so it is not a privilege escalation. It is worth documenting
as an accepted trade-off rather than leaving it to be rediscovered.

**Unverified — rules `get()`/`exists()` call budget during a wipe.** `accountDeletionPending()`
performs one `exists()` plus one `get()`. For a *verified* user, `||` short-circuits and neither
runs. For an *unverified* user — exactly the case the exception exists to serve — every delete in a
400-document batch evaluates it. Firestore documents a 20-document-access limit for batched writes,
but also states duplicate accesses to the same path are cached; all 400 calls target the same path,
so caching probably collapses them. **I did not verify this**, and deliberately did not try in the
emulator: the emulator does not enforce production access-call limits, so a green result would be
exactly the kind of false signal AGENTS.md §3 warns about. Listed in §19.

**Cloudflare Worker.** Method-restricted (POST/OPTIONS, 405 otherwise), origin-restricted, 16 KiB
body cap enforced on *byte* length. No database, no secrets, no authentication expectations. Its
weaknesses are AUS-110 (500 on malformed `at`) and AUS-111 (no rate limiting; unbounded log fields).
Client-side sanitisation is good: `context` payloads across all six `reportError` call sites carry
only benign metadata (`during`, `componentStack`, `filename`/`line`/`column`), the URL is
`location.pathname` only (no query string), and no `throw new Error(\`…${userData}\`)` pattern
exists anywhere in `web/src`. Console logging carries document ids and error objects, never amounts
or notes.

**Browser security.** CSP is strict and — importantly — **safe with this codebase**: `style-src` has
no `'unsafe-inline'`, and I verified zero `style={{}}` usages in source; the only inline style in the
bundle belongs to Firebase's redirect-auth iframe helper (an unused path), and the two
`.style.setProperty` calls are CSSOM, which CSP does not gate. `frame-ancestors 'none'` +
`X-Frame-Options: DENY`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. I confirmed
by `curl` that **all** headers apply to hashed assets and `sw.js`, not just `/` — the suspected
"headers on `/` only" gap does not exist. Firebase's public config values in the bundle are not
secrets and authorization does not depend on their secrecy; the API key is referrer-restricted
(3 authorized domains, per the smoke probe).

**Android platform.** Only `MainActivity` is exported. `BootReceiver` is `exported="false"` and
handles both `BOOT_COMPLETED` and `TIMEZONE_CHANGED`. `FileProvider` is `exported="false"`,
`grantUriPermissions="true"`, and `file_paths.xml` exposes exactly one directory
(`cache-path exports/`) — the tightest useful scope. `allowBackup="false"` plus explicit
`<exclude>` rules in both backup configs. Four permissions, all justified. No WebView, no deep
links, no cleartext config needed (targetSdk 36 blocks it by default). The App Check debug secret is
only logged behind an opt-in system property.

**CI / secrets.** Every third-party action is pinned to a commit SHA, including
`reactivecircus/android-emulator-runner` — and the release job deliberately shreds the keystore
*before* that action runs. Default `permissions: contents: read`, with `contents: write` scoped to
the publishing job alone. Gate jobs receive no secrets. The one gap is AUS-108 (green on missing
secret). `google-services.json` is not shredded alongside the keystore, but it holds only public
config.

**Privacy.** No third-party analytics, no trackers, no external fonts or images (CSP would block
them anyway), no crash-reporting SDK. Firebase usage is limited to Auth, Firestore and App Check.
The gaps are AUS-109 (opt-out replay, default-on) and AUS-104 (Android local data survives account
deletion), plus one noted in `firebase.ts:104-116`: `clearIndexedDbPersistence` fails quietly when
another tab holds Firestore open, so on a shared browser with two tabs the previous user's cached
data can survive sign-out.

---

## 9. Financial Correctness Assessment

**Amount model.** Amounts are `Double`/`number` in cents-rounded form, never signed — direction is
carried entirely by `transactionType`. This structurally eliminates the "expense counted as income"
family. Rounding is a single shared formula on each side (`Math.round(x * 100) / 100`), applied at
every aggregation boundary and at both write paths, and Android routes it through
`CurrencyUtils.roundAmount` so the test cannot assert against a private copy. `Math.round` is
half-up on both platforms for positive values, and the rules forbid non-positive amounts, so the
half-even/half-up divergence class does not arise. Maximum representable amount is bounded at
1e9 by the rules and at 9 integer digits + 2 decimals by both input sanitisers — comfortably inside
`Double`'s exact-integer range, so no precision loss is reachable through the UI.

**Parsing.** `parseAmount` is genuinely equivalent across clients for every input the UI can
produce: same "later separator wins", same "repeated separator means grouping", same "grouping
separator with exactly 3 trailing digits means thousands". The one divergence I found —
`Number.parseFloat("5-")` returns `5` on web where Kotlin's `toDoubleOrNull` returns `null` — is
**unreachable**, because both amount inputs strip `-` before parsing (`sanitizeAmountInput`
allows only `[\d,.]`; `NumericKeypadHelper` emits only digits and one separator). Both cap integer
digits at 9. `testdata/money-parity.json` is shared by `MoneyParityTest.kt` and `moneyParity.test.ts`,
which is the right way to hold this contract.

**Totals and invariants.** The invariant *visible monthly expense total = sum of all live expenses
in the period with `transactionType == 'expense'`* holds on both clients: the listener query is a
half-open `[start, end)` range on `dateMillis`, and the client filter removes `deleted`.
`sumMonthExpenses` reaches the same number by a different route (two server-side aggregates,
live minus deleted) and additionally subtracts the row being edited when it falls inside the range —
guarded on transaction type, `deleted`, *and* range membership, and reading through `as? Number`
rather than `getDouble()` so an int64-typed aggregate cannot silently coerce to 0.0. That last
detail is the difference between a correct budget warning and a silent zero, and it is handled on
both sides.

`computeTotals` classifies anything that is neither `expense` nor `income` as a transfer via a
bare `else`. For the three rule-permitted values that is correct; a legacy row carrying some fourth
value would be counted as a transfer. Transfers are excluded from cash-flow and insight totals on
both clients, so the practical impact is nil — but it is an unstated assumption.

**Periods.** Month boundaries are computed identically — local-time first-of-month at 00:00:00.000,
exclusive end, derived by adding one month rather than by arithmetic on day counts, so month lengths
and DST transitions are handled by the platform calendar on both sides. Web's
`analyticsPeriodOptions` calls `setDate(1)` before `setMonth(m - 1)`, avoiding the classic
Jan-31 → Mar-3 overflow. `dayKey` is locale-independent. The rules constrain `analyticsPeriod` to
`all_time`/`this_month`/`last_month`/`^month:\d{4}-(0[1-9]|1[0-2])$`, so an out-of-range month key
cannot be persisted. The only date-arithmetic shortcut I found is
`formatRelativeTimestamp`'s fixed `7 * 86_400_000`, which ignores DST and can pick a weekday label
instead of a date for one hour twice a year — cosmetic.

**Budgets.** The projection is best-effort on both clients by design, so a failed aggregate cannot
look like a failed save. Both required composite indexes exist and include the aggregated field
(see §12). This is the historical incident #9 guard, and it is correctly in place.

**Exports.** Escaping, formula-injection neutralisation, column order, local-time formatting and
amount formatting are all now identical between clients (`%.2f` Locale.US ≡ `toFixed(2)`), with the
`\r` quoting gap closed on both sides. The residual export issues are AUS-115 (no BOM) and the
edge case that a legacy negative amount would be emitted as `'-5.00`, a text cell — unreachable
while the rules enforce `amount > 0`.

---

## 10. Android Release Assessment

Stated precisely, without collapsing distinct claims:

| Claim | Status | Evidence |
|---|---|---|
| Compiles | **Verified** | `assembleProdDebug` BUILD SUCCESSFUL |
| Unit tests pass | **Verified** | 146 tests, 0 failures, `--rerun-tasks` (the first run reported `UP-TO-DATE` and proved nothing) |
| Lint passes | **Verified** | `lintProdDebug` BUILD SUCCESSFUL |
| R8 succeeds | **Verified** | `assembleProdRelease` BUILD SUCCESSFUL in 4m 57s |
| R8 keeps the load-bearing Room constructor | **Verified at artifact level** | `mapping.txt`: `androidx.work.impl.WorkDatabase_Impl` unrenamed, `void <init>():45:45 -> <init>` retained |
| Signed | **Verified — but with the throwaway key** | `apksigner`: `CN=Test, OU=Test, O=Test`, `5009409a…` |
| Signed by the **official** certificate | **Not applicable locally** | Real releases sign in CI from secrets. The published v2.0.2 is `CN=Ausgegeben, O=shareef01` / `24539f14…77ee`, which I verified matches the pin |
| Installs | **Not verified** | No device attached; `adb devices` empty |
| Launches | **Not verified here** | CI's release job installs and launches the signed APK on an emulator and fails if the process dies within 12s. That gate exists; it did not run in this audit |
| Signed-in workflows verified on a device | **Not verified** | Requires a device and a throwaway account; none available |

**The locally built release APK must not be distributed or sideloaded over a real install.** Its
signature (`5009409a…`) differs from the published one (`24539f14…`), so it cannot update an
existing install — and `release.yml`'s pin would correctly refuse to publish it. AGENTS.md §3's
correction on this point is accurate and I confirmed both halves.

**Release pipeline quality is high.** Three test gates precede the build; versionCode derivation is
guarded against octal parsing, component overflow, the 2.1e9 ceiling and malformed tags (a
pre-release tag like `v1.2.3-beta` is rejected loudly rather than mis-derived); the keystore is
shredded before third-party code runs and again in an `always()` sweep. I confirmed the derivation
works in reality: the published v2.0.2 APK reports `versionCode='20002' versionName='2.0.2'`.

Two residual gaps: the launch check proves only *process alive after 12s*, so "launches but is
unusable" and "crashes at 13s" both pass (AGENTS.md acknowledges this); and a downgrade tag
(`v1.0.0` after `v2.0.0`) would build and publish an APK nobody can install over the current one.

---

## 11. Web / PWA Assessment

**Production is healthy right now** — `npm run smoke` reports 11/11 against `https://aus01.web.app`,
and I independently confirmed the deployed bundle contains the API key, the reCAPTCHA site key and
the error-endpoint URL, and that security headers apply to hashed assets and `sw.js` as well as `/`.

**Service worker.** `vite-plugin-pwa` `generateSW`, 40 precached entries (1.5 MiB). `sw.js`,
`registerSW.js` and `workbox-*.js` are served `no-cache, no-store, must-revalidate` — verified live
— so a stale worker cannot pin users to an old build indefinitely. Hashed assets are `immutable`
for a year, which is correct given content hashing. `index.html` is served with Firebase's default
`max-age=3600`, so a browser can hold an hour-old shell; combined with an uncacheable SW that is
acceptable.

**The old-bundle-versus-new-rules question.** The precache is a full app shell, so a user can run a
build older than the current rules. I checked whether that can lock a user out of their own data:
it cannot, in the current rule set. Rules have only ever been *loosened* for legacy shapes
(`updatedAt` accepting Timestamp, the legacy-field allowlists), and no field the older client writes
has been removed from an allowlist. The genuine risk is prospective, and it is the reason AUS-106's
versioning matters: tightening `validExpense` in future would break cached older clients silently.

**Error boundary and recovery.** `ErrorBoundary` exists with a `reloadWithoutCache` path — the right
answer to "a render throw produced a blank page the service worker then served from cache". That
covers render-time throws; it does **not** cover AUS-102, where the throw happens inside
`getFirebaseApp()` on a path that may run outside React's render tree.

**Offline.** Firestore is initialised with `persistentLocalCache` + `persistentMultipleTabManager`,
which the comment correctly identifies as load-bearing: without it the preferences listener never
resolves offline and the app hangs on a spinner. `preferencesSync` additionally has a
`PREFS_READY_TIMEOUT_MS` fallback so a stalled snapshot cannot block startup.

**React correctness.** Listener cleanup is consistent (`onSnapshot` unsubscribes returned and
called), the all-expenses scan is de-duplicated by an in-flight promise *and* a 30s cache keyed by
uid, and the cache is invalidated on every write, on sign-out and on account deletion — I verified
all three call sites. Both category-reorder implementations have busy guards. The two React defects
found are AUS-101 (the silent category rewrite) and AUS-109 (the replay buffer).

---

## 12. Firestore Rules + Index Assessment

**Rules:** 48 emulator tests pass, plus 4 probe tests I wrote and reverted. Assessment in §8.

**Index mapping — every production query enumerated.** No query in either client lacks a serving
index, and both aggregations include the aggregated field, which is the historical incident #9 fix:

| Client | Source | Filters | Range / Order | Aggregate | Index required | Present |
|---|---|---|---|---|---|---|
| Web | `expenseRepository.ts:131,135` | `categoryId ==` | — | — | single-field (automatic) | n/a |
| Web | `:232` | — | `dateMillis` desc, `limit` | — | single-field | n/a |
| Web | `:258,394` | — | `sortOrder` asc (categories) | — | single-field | n/a |
| Web | `:507,528` | — | `dateMillis` `>=`/`<`, desc | — | single-field | n/a |
| Web | `:561` | `idempotencyKey ==` | — | — | single-field | n/a |
| Web | `:621-638` | `transactionType ==` | `dateMillis` `>=`/`<` | `sum(amount)` | **(transactionType, dateMillis, amount)** | **yes** |
| Web | `:639` | `transactionType ==`, `deleted ==` | `dateMillis` `>=`/`<` | `sum(amount)` | **(transactionType, deleted, dateMillis, amount)** | **yes** |
| Web | `:799,821` | — | `dateMillis` desc / `limit(400)` | — | single-field | n/a |
| Android | `AppRepository.kt:329` | — | `sortOrder` asc | — | single-field | n/a |
| Android | `:426-428` | — | `dateMillis` `>=`/`<`, desc | — | single-field | n/a |
| Android | `:463` | `idempotencyKey ==` | `limit(1)` | — | single-field | n/a |
| Android | `:527-544` | `transactionType ==` | `dateMillis` `>=`/`<` | `sum(amount)` | **(transactionType, dateMillis, amount)** | **yes** |
| Android | `:545` | `transactionType ==`, `deleted ==` | `dateMillis` `>=`/`<` | `sum(amount)` | **(transactionType, deleted, dateMillis, amount)** | **yes** |
| Android | `:581,747` | — | `dateMillis` desc, `limit` | — | single-field | n/a |
| Android | `:678,681` | `categoryId ==` (string and number) | — | — | single-field | n/a |
| Android | `DailyReminderWorker.kt:48` | — | `dateMillis` `>=`/`<` | — | single-field | n/a |

Field ordering in both composite indexes is correct: equality fields first, then the range field,
then the aggregated field. `firestore.indexes.json` also declares
`(idempotencyKey, dateMillis desc)`, which no current query uses — harmless, but a candidate for
removal.

**I did not verify these indexes are serving in production.** AGENTS.md §3 records they were
confirmed on 2026-08-06 by adding a real expense on a device with a budget set and reading an empty
logcat; that remains the only check worth anything here, and it needs a device.

---

## 13. Cross-Platform Parity Matrix

| Entity / behaviour | Android | Web | Verdict |
|---|---|---|---|
| Expense document fields written | `amount, dateMillis, categoryId, note, transactionType, updatedAt[, idempotencyKey]` | same **+ `id`** | Divergent but both rule-valid; feeds AUS-112 |
| Category document fields written | `name, iconName, colorInt, transactionType, sortOrder, updatedAt` | same **+ `id`** | Same |
| Document id read from | `doc.id` (authoritative) | stored `id` field wins over path | **AUS-112** |
| `updatedAt` written | `System.currentTimeMillis()` (number) | `Date.now()` (number) | Match |
| ID generation | `UUID.randomUUID()` | `crypto.randomUUID()` | Match |
| Insert idempotency | `idempotencyKey`, checked before write | same | Match |
| Duplicate transaction | narrow copy, new id, no key | narrow copy via `duplicateExpensePayload` | Match |
| Delete | hard delete | hard delete (returns row for undo) | Match |
| Edit with unresolvable category | **blocks the save**, asks for a category | **silently rewrites** it | **AUS-101** |
| Category reorder | fresh read, busy guard, atomic batch | cached list, busy guard, atomic batch | Match in outcome; both lack AUS-105's fallback |
| Category delete → reassign | ensure sentinel → reassign → recheck → delete | same | Match |
| Dedupe master selection | lowest `sortOrder`, then id | same (`pickDedupeMaster`) | Match |
| Dedupe group execution | sequential | concurrent (`Promise.all`, disjoint groups) | Divergent, benign |
| Orphan sweep marker on throw | written anyway | **not written** | **AUS-107** |
| Starter categories | 10, localized via `localizedContext()` | 10, localized via `t()` | Match |
| Money display locale | app language | app language | Match (AUS-008 closed) |
| Input decimal separator | currency-derived | currency-derived | Match |
| Amount input caps | 9 int + 2 dec | 9 int + 2 dec | Match |
| `formatAmountForInput` | `0.##` → "12,5" | `toFixed(2)` → "12,50" | **AUS-117** |
| CSV columns / escaping / amount | identical | identical | Match |
| CSV BOM | none | none | Consistent; **AUS-115** |
| Month range | local, `[start, end)`, `add(MONTH,1)` | local, `[start, end)`, `new Date(y, m+1, 1)` | Match |
| Theme enum | 10 values | 10 values | Match (and matches the rules) |
| Preferences LWW | `prefsLwwAction` | `prefsLwwAction` | Identical logic |
| Account-deletion recovery | keep-account + retry | keep-account + retry | Match (AUS-001 closed) |
| Local cleanup after deletion | **none** | prefs + cache cleared | **AUS-104** |
| i18n coverage | 329/329 | 290/290 | Both complete |

**The sequence the brief asks about** — create on Android → edit on Web → edit on Android →
delete/reassign on Web → reconnect an offline Android client — is safe for document *content*: both
clients write supersets of the same canonical fields, both merge rather than replace, and the rules
accept both shapes. The one state web accepts but mutates unsafely is an expense whose category is
the sentinel or an orphan (AUS-101).

---

## 14. CI / Test Gap Analysis

323 tests, all passing, all genuinely executed during this audit. The suite's weakness is not size
but **shape**: there is not a single UI-layer test on web (no `.test.tsx`, no React Testing Library),
and Android's three instrumentation classes did not run here. Fixtures are also uniformly modern —
no test seeds a legacy `Timestamp` `updatedAt`, a `cloudId`, or a `deleted` row through a *client
code path* (the rules tests do seed those shapes, which is why the rules are the best-covered part).

**The ten highest-value missing tests, ranked** — written as the audit found them.
**Eight of the ten (1, 3, 4, 5, 6, 7, 8, 9) are written and green; see §19a.** Item 2 was
retracted with AUS-102. Only item 10 remains, and it is marginal now that the workflow
fails loudly on a missing secret.

1. **Web edit-form category resolution (AUS-101).** Load an expense with `categoryId: '0'`; assert
   `save()` does not change `categoryId`. The single highest-value test in this list — it covers a
   live data-corruption bug on a routine journey.
2. **Smoke: App Check key present in the production bundle (AUS-102).** Two lines; closes a total-
   outage blind spot that every other gate misses.
3. **Reorder with one rules-invalid category (AUS-105).** Seed `iconName: ''` beside three healthy
   categories; assert healthy `sortOrder`s are untouched and the error identifies the bad row.
4. **Orphan-sweep marker written when the scan throws (AUS-107).** Force the expense query to
   reject; assert `orphansScannedAt` is still recorded.
5. **Error-reporting opt-out does not replay (AUS-109).** Disable → report three errors → re-enable
   → assert zero transmissions.
6. **Android local state cleared after account deletion (AUS-104).** Assert the success path invokes
   prefs-clear and cache-clear.
7. **Legacy-shape round-trip through client code, not just rules.** Seed an expense with
   `cloudId`, `categoryCloudId: null`, a `Timestamp` `updatedAt` and `deleted: false`; run it
   through `updateExpense` on both clients and assert the write is accepted and the legacy fields
   survive. Today only the rules tests know these shapes exist.
8. **Aggregation invariant: `sumMonthExpenses` ≡ filtered client-side sum.** Seed a month containing
   live rows, soft-deleted rows, income and transfers; assert the two routes agree. This is the
   direct regression test for historical incident #5, and neither route currently has one.
9. **Marker versioning (AUS-106), once implemented.** Assert an older version re-runs the sweep and
   the current version does not.
10. **CI fails on a missing `GOOGLE_SERVICES_JSON` for same-repo runs (AUS-108).** A workflow-level
    assertion, or at minimum a documented manual check that R8 actually ran.

**What each CI job proves — and does not:**

| Job | Proves | Does not prove |
|---|---|---|
| `android` | Unit logic; manifest/config sanity; debug packaging; **R8 runs** *(only when the secret is present)* | That the release APK launches; anything device-specific |
| `instrumentation` | FileProvider boundary, Hilt graph, touch targets on API 29 *(only when the secret is present)* | Anything signed-in; anything release-built |
| `web` | Pure logic, no undefined CSS utilities, bundle builds, prod deps clean | That the bundle boots; any UI behaviour |
| `rules` | Rule branches; repository logic against real Firestore semantics | Production index existence; production rule deployment; access-call limits |
| `status` | Correct aggregation of **job** results | Nothing about **skipped steps** inside a successful job (AUS-108) |
| `smoke` (scheduled) | The live site serves, is configured, and its key is alive | That the app renders or that the App Check key is present |
| `release` gates | Tests actually ran on the tagged commit | — |

---

## 15. Performance / Firebase Spark Quota Assessment

Spark allows 50,000 reads/day. Order-of-growth for the operations that matter:

| Operation | Reads | Notes |
|---|---|---|
| Cold start (steady state) | ~2 + C | `meta/accountDeletion`, `meta/dedupe`, C categories. Both one-shot passes skipped by markers |
| Cold start (first ever, or manual dedupe) | ~2 + C + **E** | Full expense scan, capped at 5,001 |
| Record / Insights, month period | M | Listener over the month only |
| Record / Insights, all-time | **min(E, 5000)** | Shared behind a 30s cache + in-flight de-duplication keyed by uid |
| Add or edit one transaction | ~3 | 1 idempotency probe + 2 aggregates (each ~1 read per 1,000 matched docs) + 1 direct read when excluding the edited row |
| Category delete | 2·L + 1 | Two `expenseDocsForCategory` passes (the deliberate TOCTOU narrowing) + the delete |
| Dedupe (manual) | C + Σ(2·L) + C + E | The most expensive operation in the app |
| Account deletion | E + C | Chunked at 400 |
| Daily reminder | D | One day of transactions, once a day |

**The dominant risk is the all-time scan**, and it is well defended: capped at 5,000, shared between
Record and Insights by an in-flight promise, cached for 30s, invalidated on every local write. The
30s window is a rate limit rather than a staleness policy, exactly as AGENTS.md §2 states, and I
verified the cache is uid-keyed and cleared on sign-out — so it cannot leak one account's rows into
another's.

Realistic worst case for an engaged user with ~2,000 transactions: ~40 all-time refreshes/day
(2,000 reads each) would reach 80,000 — over quota. In practice the 30s cache and the write-driven
invalidation make that hard to hit, and switching to the month period costs M rather than E. The
genuine amplifier is **AUS-107**: a web account whose orphan scan keeps throwing re-reads up to
5,001 documents on *every* cold start, and quota exhaustion is itself a cause of that throw — a
self-sustaining loop. That is the one quota finding worth acting on.

Two efficiencies worth noting as correct: `sumMonthExpenses` uses server-side aggregates
(~1 read per 1,000 documents) rather than the N reads it used to cost, and the reminder query is
deliberately unlimited because a `limit()` applied before the client-side `deleted` filter could
empty the page and fire a false reminder.

---

## 16. Accessibility / i18n / Privacy

**Accessibility.** Coverage is good and was clearly worked on recently. 47 `aria-label`s across 70
`<button>`s on web, with no icon-only button missing one by my scan; 86 `contentDescription`s
against 54 `Icon(` uses on Android. `useFocusTrap` and `useBodyScrollLock` hooks exist and are used
for dialogs. The documented coarse-pointer `.btn` behaviour is intact — the 44px floor lives in the
`@media (pointer: coarse)` block and `.btn` still carries no padding of its own, per AGENTS.md §2.
Android has an instrumentation `TouchTargetTest`, though it did not run here. I found no concrete
new inaccessible control to report, and I am deliberately not manufacturing one: a proper
verification needs a screen reader on a device, which was unavailable.

**i18n.** Complete on both clients — 290/290 web keys, 329/329 Android strings, zero missing in
either direction. Month names and period labels follow the **app** language rather than the system
locale on both sides: Android uses `AppCompatDelegate.setApplicationLocales`, which updates
`Locale.getDefault()` for the process, so `SimpleDateFormat(..., Locale.getDefault())` in
`PeriodUtils` is correct — I checked this specifically because it looked like a defect and is not.
Stored preferences hold stable identifiers (`en`/`de`, theme keys, `month:YYYY-MM`), never
display strings. The one hardcoded English label in `analyticsPeriodOptions` (`"All time"`) is
overridden at the call site by `stringResource(R.string.period_all_time)`.

**Privacy.**

| Data type | Stored where | Transmitted where | Retention | User control |
|---|---|---|---|---|
| Transactions (amount, note, category, date) | Firestore `users/{uid}/expenses`; Android Firestore cache (≤100 MiB); web IndexedDB | Firebase only | Until deleted | Full CRUD; account deletion wipes cloud copy |
| Categories | Firestore; same local caches | Firebase only | Until deleted | Full CRUD |
| Preferences (budget, currency, theme, reminders) | Firestore `settings/preferences`; Android DataStore (sealed via `PrefsCrypto`); web Zustand + localStorage | Firebase only | Until deleted | Editable; **not cleared on Android account deletion (AUS-104)** |
| Email address | Firebase Auth | Firebase only | Until account deletion | Account deletion |
| Error reports (name, message, stack, `componentStack`, path, user-agent) | Cloudflare Workers Logs | `ausgegeben-error-endpoint.…workers.dev` | Cloudflare log retention (not documented in-repo) | Toggle in Settings, **default on**, **bypassable by replay (AUS-109)** |
| CSV export | Android `cacheDir/exports/` (**never deleted**, AUS-114); web download | Wherever the user shares it | Indefinite on Android | Manual |

No third-party analytics, trackers, external fonts or images, and no crash-reporting SDK — the
privacy-by-design claim holds. The divergences between the claim and the implementation are
AUS-109 (opt-out semantics and default), AUS-104 (Android erasure incompleteness), AUS-114 (export
residency), and the undocumented retention of error reports.

---

## 17. Recommended Fix Order

Ranked by risk × likelihood × blast radius ÷ fix complexity.

### P0 — before the next release
1. **Commit `.github/release-cert.sha256` (AUS-103).** One command; without it no release can ship.
   Correct AGENTS.md §4's "placeholder" note at the same time.
2. **Fix the web edit-form category rewrite (AUS-101).** Small, contained, and it is silently
   corrupting stored data on a routine journey today.
3. ~~Add the App Check key check and fail the build (AUS-102).~~ **Retracted** — `vite.config.ts`
   already fails the build, and `smoke.mjs` already hard-fails on a keyless bundle. A direct
   assertion was added to `smoke.mjs` anyway as cheap defence-in-depth. Instead: **record in
   AGENTS.md §4 that `web/.env.production` is single-copy, unbacked-up state**, since that is the
   real (and much smaller) residual risk.

### P1 — next release cycle
4. **Clear Android local state after account deletion (AUS-104).** Two calls; erasure correctness.
5. **Write the orphan-scan marker on throw in web (AUS-107).** Small; removes a self-sustaining
   quota loop.
6. **Version the orphan-scan marker (AUS-106).** Slightly larger (a rules allowlist change too), but
   every future data remediation depends on it — and this exact design has already burned the
   project once.
7. **Validate categories before the reorder batch (AUS-105).** Turns a permanent, unexplained
   failure into an actionable one.
8. **Stop the error-report replay bypass (AUS-109),** and add a one-line disclosure by the toggle.

### P2 — worthwhile hardening
9. Require `GOOGLE_SERVICES_JSON` on same-repo CI runs (AUS-108).
10. Reverse the seven `{ id: d.id, ...d.data() }` spreads (AUS-112) — free, removes a whole class.
11. Harden the Worker: guard the `at` parse (AUS-110); cap and strip control characters from logged
    fields, add a per-IP counter (AUS-111).
12. Add a UTF-8 BOM to both CSV exports (AUS-115); align `formatAmountForInput` (AUS-117).
13. Clean up stale Android exports (AUS-114); fix the `moveCategory` busy-guard latch (AUS-113);
    add `fetch-depth: 0` to the release checkout (AUS-116); note the HSTS override (AUS-118).
14. Work through the ten tests in §14, starting with 1, 2 and 8.

---

## 18. Things Investigated and Found Correct

Recorded so future auditors do not re-report them.

- **CSP `style-src` without `'unsafe-inline'`.** Looks like it should break React, and does not:
  zero `style={{}}` in source, the only inline style in the bundle is Firebase's unused
  redirect-auth iframe helper, and `.style.setProperty` is CSSOM, which CSP does not gate.
- **Security headers on assets.** Verified by `curl` that CSP, HSTS, XCTO, XFO, Referrer-Policy and
  Permissions-Policy are all present on hashed assets and `sw.js`, not just `/`. Firebase Hosting
  applies every matching `headers` block.
- **Firebase public config in the bundle.** API key, project id, app id and the reCAPTCHA site key
  are all meant to be public. Authorization depends on the rules, not their secrecy, and the key is
  referrer-restricted. Not a finding.
- **App Check unenforced, and the web 403.** Deliberate (AGENTS.md §2). `installAppCheck` is
  try/caught so a failed provider install cannot crash launch — the previously reported
  `AUS-011` crash risk is closed.
- **Deleting the Uncategorized sentinel unconditionally** in `deleteCategory`. Looks like it would
  strand rows permanently (and by the rules it would — I confirmed the mechanism by probe), but both
  category UIs filter the sentinel out of the deletable list, so the branch is unreachable from the
  UI. Defensive path, not a live bug. Worth a comment saying so.
- **Composite index field ordering.** Both aggregation indexes correctly place equality fields, then
  the range field, then the aggregated field. Historical incident #9's fix is genuinely in place.
- **`parseAmount` divergence on trailing `-`.** `parseFloat("5-")` is `5` on web, `null` on Android,
  but both amount inputs strip `-` before parsing, so it is unreachable.
- **Android month/period labels using `Locale.getDefault()`.** Looks like it would follow the system
  locale rather than the app language; it does not, because the app calls
  `AppCompatDelegate.setApplicationLocales`, which updates the process default.
- **The 30s all-time scan cache.** A rate limit, not a staleness policy, exactly as documented —
  uid-keyed, invalidated on every write and on sign-out. Verified all three invalidation sites.
- **Duplicate-transaction payloads.** `duplicateExpensePayload` and Android's `expensePayload`
  both deliberately exclude `id`, `idempotencyKey` and legacy fields. No key collision, no
  legacy-field propagation.
- **`analytics.ts` pure functions not filtering `deleted`.** Correct: every caller feeds them
  pre-filtered data. Worth an explicit invariant test (§14 item 8), not a code change.
- **The double `reassignCategoryExpenses` call** in `deleteCategory`/`deduplicateCategories`. Not a
  copy-paste bug — it is the documented TOCTOU narrowing, and both clients do it identically.
- **Dev-only npm advisories.** 7 high / 8 moderate, every one a transitive of `firebase-tools`,
  `vite` or `wrangler`. `npm audit --omit=dev` reports **0**. CI audits the right tree.
- **README test counts.** Claims 323; I measured exactly 323. The previous drift is closed.
- **i18n completeness.** Both clients: zero missing keys in either direction.
- **`deleteCollectionBatched` infinite-loop risk.** A rejected commit throws out of the `while(true)`
  rather than spinning. Both clients.

---

## 19. Unverified Assumptions

1. **Nothing was verified on a physical or virtual Android device.** `adb devices` was empty, and
   AGENTS.md §4 records that a phone appearing mid-session once caused
   `connectedProdDebugAndroidTest` to uninstall the release build and wipe local data. I therefore
   ran no `connected*` task at all. Every Android UI, lifecycle, WorkManager, reminder-scheduling
   and signed-in claim in this report is static or unit-level.
2. **The three instrumentation classes** (`ExportFileProviderTest`, `MainActivityLaunchTest`,
   `TouchTargetTest`) did not run.
3. **The release APK was not installed or launched.** R8 is verified at artifact level; launch
   evidence must come from CI's emulator gate or a device.
4. **Production index serving state is unconfirmed.** The declarations are correct and complete, but
   only adding a real expense on a device with a budget set and reading an empty logcat proves they
   serve — the emulator invents indexes on demand and `gcloud … indexes list` has previously
   reported `READY` for a *different* index.
5. **Firestore rules `get()`/`exists()` call limits during a batched wipe by an unverified user**
   (§8). I deliberately did not test this in the emulator, because the emulator does not enforce
   production access-call limits and a green result would be a false signal.
6. **Whether real legacy documents carry an `id` field that differs from their document id**
   (AUS-112). Confirming this requires reading real user documents, which is out of scope.
7. **Cloudflare Workers Logs retention** for error reports — not documented in-repo and not
   externally checked.
8. **No throwaway account was available**, so no authenticated production journey was driven. Only
   the read-only `npm run smoke` probe was run against production.
9. **The deployed site is not this tree.** Deployed bundle `index-BlkU3QNp.js`; this tree builds
   `index-B9eJMEGq.js`. Production findings describe the deployed build; code findings describe the
   working tree.

---

## 19a. Remediation Applied

Everything in P0, P1 and P2 was implemented after the audit, on the same working tree,
along with the highest-value missing test from §14 (the aggregation invariant).
What changed, and how each was actually checked:

| ID | Fix | Verified by |
|---|---|---|
| **AUS-101** | `useAddTransactionViewModel` now resets the category only on a genuine transaction-type change (tracked in a ref seeded from the loaded expense), flags an unresolvable stored category, and refuses the save instead of substituting one. The picker filter and the "is this stored category acceptable" check were merged into one shared predicate so they cannot drift apart again — that drift *was* the bug. | 8 new unit tests (`editCategoryResolution.test.ts`), including one asserting the two conditions agree for every category |
| **AUS-102** | Retracted, not fixed — see §4. A direct App Check assertion was added to `smoke.mjs` anyway as cheap defence-in-depth, and `AGENTS.md` §4 now records that `web/.env.production` is single-copy, unbacked-up state. | Both failure paths tested directly (build fails / smoke hard-fails) |
| **AUS-103** | `.github/release-cert.sha256` staged. `AGENTS.md` §4's "holds a placeholder" note replaced with the verified fingerprint, the commands that produced it, and the real remaining hazard (the file must be *committed*). | `git status` shows `A  .github/release-cert.sha256`; fingerprint matched against the published v2.0.2 APK |
| **AUS-104** | New `AccountActions.clearAccountLocalState()`, implemented on `AppRepository` with the same two best-effort steps `signOut()` uses, called from `AccountDeletionCoordinator` only when the Auth delete actually succeeded. | 3 new tests: cleared on success, **not** cleared on a failed wipe, **not** cleared when Auth delete fails after a successful wipe |
| **AUS-105** | `CategoryValidator.isRulesWritable` / `isRulesWritableCategory` screen the reorder set against the rule bounds before the batch commits, and both clients now raise a typed error naming the offending row. The batch stays atomic — a per-document fallback would leave the type half-renumbered. | 5 Kotlin + 5 TS unit tests, including that legacy names the *name* validator dislikes are still accepted (rejecting them would freeze rows the server accepts) |
| **AUS-106** | `orphanScanVersion` added to the marker, to `validDedupeMarker()` (bounded `int`, 0–999999), and to both clients' gates. The sweep now records which generation ran, so bumping one constant re-runs a future repair. | 2 new rules tests (accepted when bounded, rejected for `'1'`/`-1`/`1e6`/`1.5`/`null`); 6 TS + 6 Kotlin unit tests |
| **AUS-107** | Web `sweepOrphanedExpenses` wraps the scan and writes the marker in a `finally`, matching Android. Closes the self-sustaining loop where quota exhaustion made the scan throw, the skipped marker made the next cold start scan again, and that spent more quota. | Emulator suite still green; covered by the same version tests |
| **AUS-109** | `reportError` no longer buffers while reporting is opted out, and `setErrorBuffering(false)` drops anything already held. The opt-out now suppresses rather than defers. | 3 new tests: nothing replays after opt-out → opt-in; genuine startup crashes still replay; buffering resumes on opt-in |


### P2, also applied

| ID | Fix | Verified by |
|---|---|---|
| **AUS-108** | CI now fails on a missing `GOOGLE_SERVICES_JSON` for same-repo runs, and skips only for forks. Green-with-a-warning previously hid that R8 and all three instrumentation classes never ran. | YAML inspected; fork branch preserved |
| **AUS-110** | Worker `summarize()` no longer throws on a malformed `at` — `isoOrNull` returns null instead of a 500. | Executed the worker in Node: `{at:'x'}` → **204**, was 500 |
| **AUS-111** | Every interpolated log field is capped and has C0/C1 control characters collapsed to spaces, so a newline in `source`/`name` can no longer forge a log line; `Content-Length` is checked before the body is buffered. | Executed: a newline in `source` now renders inline in one log line |
| **AUS-112** | All seven `{ id: d.id, ...d.data() }` spreads reversed to `{ ...d.data(), id: d.id }`, so the document path id always wins over a stored `id` field. | `grep`: 0 unsafe, 7 safe |
| **AUS-113** | `moveCategory` wraps its fresh category read in `withTimeoutOrNull`; the flow emits nothing on a listener error, so `first()` could suspend forever and latch the busy guard for the ViewModel's life. | Compiles + Android suite green |
| **AUS-114** | Android deletes prior exports before writing a new one, instead of leaving a full plaintext financial history in the cache directory indefinitely. | Android suite green |
| **AUS-115** | UTF-8 BOM prepended at the file layer on both clients (`Blob(['﻿', csv])` / `writeText("﻿" + …)`), so Excel on Windows stops mangling umlauts. `exportCsv()` stays pure, so the CSV parity tests still assert exact bytes. | Both suites green. Android lint caught a *literal* BOM byte in the Kotlin source on the first attempt — replaced with the `﻿` escape in both languages |
| **AUS-116** | `fetch-depth: 0` on the release checkout, so `git describe --tags HEAD^` works and `--notes-start-tag` stops silently falling through to the fallback publish command on every release. | YAML inspected |
| **AUS-117** | Android `formatAmountForInput` switched from `"0.##"` to `"0.00"`, matching web's `toFixed(2)`. | 7 new shared vectors in `testdata/money-parity.json`, asserted by **both** `MoneyParityTest` and `moneyParity.test.ts` |
| **AUS-118** | Not code — `firebase.json` is JSON and takes no comments. Firebase Hosting overrides the configured HSTS `max-age` with its own; recorded here rather than left to be rediscovered. | `curl` on `/` and on an asset |
| **§14 item 8** | New `emulator/aggregationInvariant.test.ts` pins `sumMonthExpenses` (two server-side aggregates) and the client-filtered UI route to one hand-computed figure, over a fixture with live rows, soft-deleted rows, income, transfers and both range boundaries. This is the direct regression test for the €7,655 incident, which neither route had. | 5 new emulator tests, green |

**Rate limiting was not added to the Worker.** Meaningful per-IP limiting needs KV or Durable
Objects; an in-memory counter is per-isolate and trivially bypassed. The endpoint remains
open to anyone who sets the `Origin` header — as its own comment already says, `Origin` is
not a security boundary. Impact is bounded to log noise and the free tier's 100k requests
a day; the sanitisation above removes the log-forging half of it.

**One deliberate, user-visible consequence.** Bumping `ORPHAN_SCAN_VERSION` to 1 means every
existing account runs the orphan sweep **once** on its next cold start — one scan of up to
5,001 expense documents. That is the point of the change: it is the only way the current
sweep ever reaches the long-lived accounts whose markers were already set. It is also the
exact cost the marker exists to bound, so it should happen once and never again unless the
constant is bumped deliberately.

**Verification after remediation** (all re-run, not inherited from the earlier pass):

| Check | Before | After |
|---|---|---|
| Web unit tests | 85 | **109** |
| Firestore rules tests | 48 | **50** |
| Repository emulator tests | 44 | **59** |
| Android unit tests | 146 | **162** |
| **Total** | **323** | **380** |
| `tsc --noEmit` | pass | pass |
| `lint:css` | 459 tokens, 0 undefined | 459 tokens, 0 undefined |
| `npm run build` | pass | pass |
| `lintProdDebug` | pass | pass |
| `assembleProdRelease` (R8) | pass | pass — re-run against the final source, and `mapping.txt` still retains `WorkDatabase_Impl.<init>()` unrenamed |
| i18n parity (web / Android) | 290/290 · 329/329 | **291/291 · 330/330** |
| Production smoke | 11/11 | **12/12** (adds the App Check key assertion) |

### Device and production verification (2026-08-31, after shipping)

The paragraph that stood here said nothing had been run on a device. That is no longer
true. v2.0.3 was released and the following were confirmed by the user on their real
phone and on the deployed site — the standard AGENTS.md §1 asks for, and the thing this
report could not previously offer:

| Check | Result | Why it could not be proven any other way |
|---|---|---|
| v2.0.3 is the running binary | Settings shows `v2.0.3` (`BuildConfig.VERSION_NAME`) | An install that silently fails as a downgrade looks identical to one that worked |
| In-place update over v2.0.2 | Session and data intact, no re-login | Proves the signing key matched; a different key is rejected, and a reinstall would have cleared the session |
| CI emulator launch of the signed APK | `release APK survived first launch (pid 5916)` | R8 succeeding proves nothing — historical incident #1 was a release-only launch crash |
| Composite indexes serving | Budget warning appeared | Both clients wrap the projection best-effort, so a missing index is **silent**. The emulator invents indexes on demand and `indexes list` has reported READY for the wrong index |
| `sumMonthExpenses` returns a *correct* figure | Spent total matched the user's actual month | The €7,655 incident survived 65 unit + 39 emulator tests because no fixture seeded a `deleted` row. This account has them; the subtraction pass works on real data |
| Category reorder against legacy rows | Moves and persists | 12 of 17 categories on this account carry `cloudId`. AVD data carries none of that drift — the reason a previous "device-verified" claim was wrong the same afternoon |
| **AUS-101 fixed on production web** | Editing an Uncategorized transaction now refuses instead of silently refiling | The highest-severity finding in this report, confirmed on the deployed bundle |

**`AUS-104` verified on throwaway accounts.** A throwaway was set to distinctive values
(GBP, budget 1234, reminder 06:15), those were confirmed to survive a force-stop so they
were genuinely persisted, the account was deleted, and a *second* throwaway was then
registered on the same device. It came up with EUR, no budget and default reminders. A new
account has no cloud preferences, so the sync pushes whatever is local up to it — any
fingerprint appearing there could only have come from the deleted account. None did, so
`clearAccountLocalState()` ran.

The offline-cache half is **reached, not proven**: both calls sit in the same method, each
wrapped best-effort, so clearing the prefs shows the cache call was made — a failure inside
it is logged, not surfaced. Confirming the cache file is gone needs `adb run-as`, which
only works on a debug build, and a new account cannot read the old one's cached documents
in any case because the paths are uid-scoped. This is as far as a release build goes.

**Still unverified.** `AUS-113`'s timeout cannot be triggered on demand. `AUS-115`/`AUS-117`
(CSV BOM, amount prefill) are cosmetic and were skipped. The one-off orphan sweep's logcat
trace was not read — no cable.

---

## 20. Final Release Gate

# PASS WITH CONDITIONS

The application logic, security boundary and financial model are sound, and every historical
incident has a working guard — two of which I verified at artifact level rather than trusting the
documentation. There is nothing here that warrants blocking on a Critical.

**Conditions, all of which must be met before the next release:**

1. **Commit `.github/release-cert.sha256`** (AUS-103). It is untracked today, so a `v*` tag will
   fail the signature-verification step. The value itself is correct — I verified it against the
   published v2.0.2 APK — so this is purely `git add`. Also correct AGENTS.md §4, which still
   describes the file as holding a placeholder.
2. **Fix the web edit-form category rewrite** (AUS-101). This silently modifies stored financial
   data on a routine journey, and the two clients currently disagree about what the same action
   does.
3. **Obtain launch evidence for the Android build being released.** CI's emulator gate satisfies
   this; nothing in this audit does. Do not read "R8 succeeded" or "146 unit tests pass" as launch
   evidence.

**Recommended but not blocking:** AUS-104, AUS-105, AUS-106, AUS-107 and AUS-109 in the next cycle,
in that order.

---

*Files created by this audit: `AUDIT_REPORT.md` (this file). One temporary rules test
(`web/rules/AUDIT_PROBE.temp.test.ts`) was written to confirm the referential-integrity claims in
§7 and §8, run against the emulator, and deleted. No tracked file was modified.*
