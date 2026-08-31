# Ausgegeben Production Readiness Audit

Audited commit: `HEAD` of `main` (working tree clean at audit start)
Audit date: 2026-08-31
Auditor role: principal engineer / appsec / Firebase / Android / web / data-integrity / QA / supply chain

---

## 1. Executive Summary

**Overall: 8.0 / 10 — READY WITH CONDITIONS.**

This is an unusually well-defended codebase for a two-client personal-finance app on Firebase
Spark. The Firestore rules are the real security boundary and they hold: I verified per-user
isolation, schema validation and legacy-shape tolerance line by line and ran all 38 rules tests
green against the emulator. Cross-user read and write are structurally impossible — by construction
in the rules, though the automated proof of that is one assertion thick (AUS-026). Money is
handled with deliberate rounding at every aggregation boundary, and the sign convention is carried
by `transactionType` rather than by signed amounts, so the classic "expense counted as income"
family of bugs cannot occur. The legacy-compatibility work described in `AGENTS.md` is genuinely
implemented and genuinely tested against real observed document shapes, not invented fixtures.

What holds this back from a clean pass is not the application logic — it is **the release gate and
one account-lifecycle dead end**. `release.yml` runs no tests at all, so a `v*` tag on a commit
whose CI failed will build, sign and publish an APK; and it verifies that the APK is signed without
verifying *which key* signed it. Separately, an Android user whose account deletion is interrupted
after the cloud wipe is left with an unusable account and no in-app way out — the web client has
exactly that recovery path, so this is a one-sided gap rather than a design decision.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 1 |
| Medium | 5 |
| Low | 13 |
| Info | 9 |

**Remediation status (2026-08-31, after the audit was written).** 12 findings have been
fixed and verified; see §29a for what changed and how each was checked. Test count went
from 295 to 307. Everything in P0 and P1 is closed except the one step that cannot be
done from a workstation: `.github/release-cert.sha256` still holds a placeholder, and
**the next `git tag` will fail until the real fingerprint is committed** — deliberately,
because failing closed was the whole point of AUS-003.

### Top five risks

1. **[AUS-001]** Android has no recovery from an interrupted account deletion; the account is left
   permanently unusable (no categories, nothing recordable). Web has the exit; Android does not.
2. **[AUS-002]** `release.yml` runs zero tests. A tag on a red commit publishes a release APK.
3. **[AUS-003]** `apksigner verify` proves the APK is signed, not that the *expected* key signed it.
   A valid-but-wrong keystore secret publishes an APK that cannot update any existing install.
4. **[AUS-004]** The decrypted release keystore sits in the workspace while a third-party action
   pinned to a mutable `@v2` tag runs in the same job.
5. **[AUS-006]** Orphaned transactions are permanent once the one-shot orphan marker is set, and
   Android silently omits them from the Insights category breakdown, so the donut total disagrees
   with the headline total with no indication.

### Top five engineering strengths

1. **The Firestore rules are the strongest part of the system.** Default-deny, per-user, schema
   allowlisted with type *and* size bounds on every field including the tolerated legacy ones, and
   `users/{userId}` itself is explicitly unreadable. 38 tests cover the branches.
2. **Legacy tolerance is derived from real data, not guessed.** The rules comments record actual
   measured distributions ("22 of 89 rows", "12 of 17 categories"), and the tolerance is bounded
   rather than waved through. This is the correct answer to the historical incidents.
3. **Poison-document isolation is implemented, not just intended.** `reassignExpenses` on both
   clients falls back from a 450-doc batch to per-document writes and *counts* unfixable rows
   instead of throwing, so one rules-rejected row cannot strand the healthy ones.
4. **Read-quota discipline is treated as an architectural requirement.** Shared listeners
   (`monthExpensesShared` is reused as the list source), one-shot markers, a capped all-time scan
   with a truncation banner, and a dedicated 13-test `readReduction.test.ts` suite.
5. **The release APK is actually launched.** CI and `release.yml` boot an emulator and install the
   signed artifact — the specific gap that once shipped an R8-broken release is closed by a real
   runtime check, not by a comment.

### Sub-scores

| Area | Score | Basis |
|---|---:|---|
| Architecture | 8.5 | Clean UI → view-model → repository layering on both clients; one serverless backend; constraints documented and respected. Cost is deliberate duplication of business rules across two languages. |
| Financial Correctness | 8.0 | Sign convention by type, rounding at every boundary, rules forbid non-positive amounts. Loses points for the Android breakdown drop (AUS-006) and display divergence (AUS-008). |
| Data Integrity | 8.0 | Excellent legacy tolerance and batch isolation; orphan permanence is the remaining gap. |
| Firebase Security | 9.0 | Verified line by line; no cross-user path; bounded schema; 38/38 tests green. Only quota abuse remains, which is inherent to client-direct Spark. |
| Authentication | 7.0 | Correct reauth-before-wipe ordering, verified-email gate honoured by both clients. AUS-001 is an account-lifecycle dead end on the distributed client. |
| Android | 8.0 | Sound Flow/StateFlow usage, shared listeners, activity-scoped add form, R8 keep rules correct. AUS-011 hard-crash path and AUS-012 timezone gap. |
| Web / PWA | 8.5 | Strict TS clean, no `dangerouslySetInnerHTML`, error boundary plus global handlers, no runtime caching of Firebase, fail-closed build guard on the App Check key. |
| Offline / Sync | 7.5 | LWW is explicit and clock-bounded by rules; sign-out cache clearing is correct. Pending offline writes are discarded on sign-out (accepted trade for isolation). |
| Performance / Quota | 7.5 | Strong discipline, but unverified accounts can drain the daily read quota (AUS-005) and rules `get()` adds reads per write. |
| Accessibility | 7.0 | Real instrumentation: 56 `aria-label`, 31 live regions, a shared `useFocusTrap`, 6 reduced-motion blocks; Android has 82 content descriptions and 9 `clearAndSetSemantics`/live regions, with 6 touch-target instrumentation tests. Held back by gesture-only destructive actions on Android (AUS-027). Not screen-reader verified in this audit. |
| Privacy | 8.0 | Error reports carry no identity or financial data; prefs sealed with `PrefsCrypto`; `allowBackup=false`. Undisclosed off-device error transmission costs a point (AUS-016). |
| Testing | 8.0 | 295 tests actually green at HEAD, including 44 emulator repository tests and fixtures built from real legacy shapes. Docked for the thinnest coverage sitting under the most important property: cross-user isolation rests on one assertion (AUS-026). |
| CI / CD | 6.5 | CI itself is good and builds the shipping artifact. The release path is the weak link (AUS-002, AUS-003). |
| Supply Chain | 6.5 | Zero production npm vulnerabilities, but mutable action tags with a keystore on disk (AUS-004) and a lingering signing-material workflow (AUS-014). |
| Maintainability | 8.0 | Comments explain *why* with incident references. Duplicated domain logic across clients is the standing debt. |

---

## 2. Audit Scope and Verification Performed

Everything below was executed locally on Windows against the working tree. No deployment, no
production Firebase mutation, no physical-device interaction.

| Check | Result | Evidence | Limitation |
|---|---|---|---|
| Web unit tests | **75 passed / 13 files** | `npm test` (vitest 4.1.10) | Unit-tested |
| Firestore rules tests | **38 passed / 1 file** | `npm run test:rules`, Firestore emulator, project `demo-ausgegeben-rules` | Emulator-tested; emulator invents indexes |
| Repository emulator tests | **44 passed / 4 files** | `npm run test:emulator`, project `demo-ausgegeben-repo` | Emulator-tested |
| Android unit tests | **129 passed / 21 classes, 0 failures** | `./gradlew testProdDebugUnitTest --rerun-tasks` (forced, not UP-TO-DATE) | Unit-tested |
| Android lint | **BUILD SUCCESSFUL** | `./gradlew lintProdDebug` | Compile/static only |
| Web typecheck | **clean** | `npm run lint` (`tsc --noEmit`) | Static only |
| Web CSS class check | **OK — 457 class tokens, no undefined utilities** | `npm run lint:css` | Static only |
| Web production build | **built in 11.26s**; PWA precache 40 entries / 1522.25 KiB | `npm run build` | Build only |
| npm audit (production deps) | **0 vulnerabilities** | `npm audit --omit=dev --audit-level=high` | — |
| npm audit (all deps) | 15 (8 moderate, 7 high), all dev tooling (`firebase-tools` → `gaxios`/`uuid`) | `npm audit` | Dev-only, not shipped |
| Android release build (R8) | see §25 | `./gradlew assembleProdRelease` | Release-built; **release runtime not verified locally** |
| Android instrumentation | **not run** | 9 `@Test` methods counted in `app/src/androidTest` | A physical phone was attached to adb for part of this session; per `AGENTS.md` §4 no `connected*` task was run |
| Production smoke | **not run** | `web/scripts/smoke.mjs` reviewed by inspection instead | Would touch production hosting |

Test counts were derived two independent ways where possible: by counting `@Test`/`it(` in source
and by parsing the JUnit XML from a forced rerun. Both give 129 for Android.

**Deliberate omissions.** I did not run `npm run smoke`, did not deploy rules or indexes, did not
run `connected*` Gradle tasks, did not read production Firestore documents, and did not touch the
physical device. Anything that needed those is marked *Requires production/device verification*.

---

## 3. Architecture

Corrected from source. **There is no Room database** — the audit brief and `AGENTS.md`'s ProGuard
discussion both reference Room, and I confirmed by searching every Gradle file and source tree that
`androidx.room` is not a declared dependency of this app. Local persistence on Android is DataStore
for preferences only; all transaction and category state lives in Firestore, with the Firebase SDK's
own on-disk offline cache (100 MiB, `AusgegebenApplication.kt:37-43`) providing offline reads and
write queueing. The Room keep rule in `proguard-rules.pro` is still load-bearing because
`androidx.work:work-runtime` bundles Room internally for its `WorkDatabase`.

```
                 ┌──────────────────── Firebase (Spark, no Cloud Functions) ────────────────────┐
                 │                                                                              │
                 │   Auth (email/password)          Firestore                     Hosting       │
                 │        │                users/{uid}/expenses/{id}            (web/dist)      │
                 │        │                users/{uid}/categories/{id}                          │
                 │        │                users/{uid}/settings/preferences                     │
                 │        │                users/{uid}/meta/{dedupe|accountDeletion}            │
                 │        │                         ▲                                           │
                 │        │      firestore.rules ───┘  (the security boundary)                  │
                 └────────┼─────────────────────────┼───────────────────────────────────────────┘
                          │                         │
          ┌───────────────┴─────────┐     ┌─────────┴──────────────────┐
          │ ANDROID (Kotlin/Compose)│     │ WEB (React 19 / Vite PWA)  │
          ├─────────────────────────┤     ├────────────────────────────┤
          │ Compose screens         │     │ views/*.tsx                │
          │   ↓ collectAsState      │     │   ↓                        │
          │ ViewModels (Hilt)       │     │ viewmodels/use*ViewModel   │
          │  Expense/Insights/Add/  │     │   ↓                        │
          │  Category/Auth          │     │ repositories/expenseRepo   │
          │   ↓ StateFlow/shareIn   │     │ services/auth|preferences  │
          │ AppRepository           │     │   ↓                        │
          │  (+ FirestoreClient)    │     │ Zustand: authStore,        │
          │   ↓                     │     │  preferencesStore,         │
          │ DataStore (PrefsCrypto) │     │  toastStore                │
          │ WorkManager (reminders) │     │ Service worker (Workbox)   │
          └─────────────────────────┘     └────────────────────────────┘
                     │                                  │
                     └──── error reports (opt-in) ──────┴──→ Cloudflare Worker
                                                              tools/error-endpoint
```

**Sources of truth.** Firestore is the only source of truth for financial data on both clients.
Neither client keeps a durable local mirror it reconciles against; the Firebase SDK cache is
treated as a cache, not a database. Preferences are dual-homed: DataStore / Zustand locally and
`settings/preferences` in Firestore, reconciled last-write-wins on a numeric `updatedAt`.

**Listeners.** Android: `allCategories`, `getExpensesInRange`, `allExpenses` (capped), plus a
preferences snapshot listener. `ExpenseViewModel` deliberately reuses one month listener
(`monthExpensesShared`, `ExpenseViewModel.kt:91-121`) for the budget bar, the "most spent" insight
and the list when the period is this month, rather than opening a second identical query. Web
mirrors this with `onCategoriesChanged` / `onExpensesInRange` and a module-scoped memoised
all-time scan.

**Shared concepts implemented twice** (the standing parity risk): month/period boundaries, totals
and grouping, currency parse/format, CSV export, category reorder, orphan repair, dedupe, LWW
preference merge, soft-delete-with-undo. Each pair is discussed in §15.

---

## 4. Trust Boundaries / Threat Model

**Assets.** Financial records (amount, date, category, free-text note); account identity (email);
Auth session tokens; the project's Firebase Spark daily quota; the release signing key.

**Actors and what they can reach.**

| Actor | Reaches | Bounded by |
|---|---|---|
| Owner (verified) | own subtree, read+write | `firestore.rules` schema + size bounds |
| Owner (unverified) | own subtree, **read only**; plus `meta/accountDeletion` write | `isEmailVerified()` on all create/update except the deletion marker |
| Any authenticated user targeting another UID | nothing | `isOwner(userId)` on every rule; `users/{userId}` itself is `if false` |
| Unauthenticated script | nothing in Firestore; hosting assets and the public Firebase config | rules require `request.auth != null` |
| Automated account farm | Auth quota, Firestore read quota | no App Check (deliberate), no rate limiting in rules → see AUS-005 |
| Compromised dependency | web: build-time only (0 prod vulns); CI: a mutable third-party action tag sees the keystore → AUS-004 | — |
| Accidental legacy data | can make a row unwritable if the rules tighten | rules deliberately tolerate the observed shapes |

The public Firebase Web/mobile API key is **not** treated as a secret here and is not reported as
one; it identifies the project and is designed to be shipped.

---

## 5. Critical Findings

**None.** No cross-user data exposure, no authentication bypass, no committed private key, no
unauthenticated destructive path, and no release-pipeline compromise was found.

---

## 6. High Findings

### [AUS-001] An interrupted account deletion leaves an Android account permanently unusable, with no in-app recovery

**Severity: High**
**Confidence: Medium**
**Area: Authentication / Account Lifecycle / Android**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/data/AccountActions.kt:4-13`;
`app/src/main/java/com/aus/ausgegeben/ui/SettingsScreen.kt:497-520`;
`app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:183-186`;
compare `web/src/repositories/expenseRepository.ts:362-380` and `web/src/views/SettingsView.tsx:99-136`

**Evidence.**
The deletion protocol is identical on both clients and its ordering is correct: reauthenticate,
write `meta/accountDeletion.pendingDeletion = true`, wipe cloud data, then delete the Auth user
with three retries. On Android that is `SettingsScreen.kt:497-502` calling
`repository.markAccountDeletionPending()` → `repository.deleteAllUserData()` →
`authRepository.deleteAccount()` (`AuthRepository.kt:126-143`, which retries 3× with backoff).

The marker is deliberately never cleared on success-of-wipe/failure-of-Auth-delete, and
`ensureSeeded` refuses to seed while it is set:

```183:186:app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt
            if (isAccountDeletionPending()) {
```

Because `firestore.rules:234` requires the referenced category document to *exist* on every expense
create and update, an account with zero categories cannot record anything at all. So the state after
a failed Auth delete is: data gone, account alive, no categories, and seeding permanently suppressed.

The web client treats this as a recoverable state and offers the exit — it detects the marker in
Settings (`SettingsView.tsx:102-119`) and exposes `keepAccount()` which calls
`clearAccountDeletionPending()` and immediately re-seeds (`SettingsView.tsx:121-136`). The rules
already permit that delete precisely because `pendingDeletion` is true
(`firestore.rules:257-258`), and there is a rules test for it
(`web/rules/firestore.rules.test.ts:308`).

Android has none of this. `AccountActions` (the entire account-lifecycle surface) declares only
`isAccountDeletionPending`, `markAccountDeletionPending` and `deleteAllUserData` — there is no
clear method anywhere in the Kotlin tree, and `isAccountDeletionPending` is consulted only inside
`ensureSeeded`. No banner, no explanation, no recovery.

**Trigger.** Minimum realistic sequence, all on Android: Settings → delete account → correct
password → reauth succeeds → `markAccountDeletionPending` succeeds → `deleteAllUserData` succeeds →
the process is killed or the network drops for the duration of three `user.delete()` attempts
(400 ms + 800 ms backoff, so a window of roughly 1–2 s plus request time). Losing connectivity in
a lift, or Android killing a backgrounded activity mid-coroutine (the flow runs in the composition
`scope`, not a foreground service), is enough.

**Impact.** The user's data is gone — that part they asked for. What they did not ask for is an
Auth account that still exists, still accepts their password, and opens into an app that can never
record a transaction. They cannot re-register the same email because the Auth user is still there.
The only exits are (a) retry deletion until the Auth delete succeeds, or (b) sign in to the web app
and press "keep account" — which an APK-only user has no reason to know exists. The Android app is
the primary distribution channel (GitHub Releases), so the client most likely to hit this is the
one without the fix.

**Existing mitigation.** Reauth-before-wipe removes the dominant `requires-recent-login` failure
mode; three retries with backoff cover transient blips; the failure toast
(`R.string.settings_delete_account_incomplete`) tells the user deletion was incomplete; the web
client can rescue the account; the rules already allow the marker to be cleared without email
verification, so no rules change is needed.

**Recommendation.** Add `clearAccountDeletionPending()` to `AccountActions`/`AppRepository`
(a single `accountDeletionDoc(u).delete()`, mirroring the web method), and surface it on Android
the way web does: when `isAccountDeletionPending()` is true, show a Settings banner offering
"keep this account" that clears the marker and then calls `ensureSeeded()`. This is ~30 lines and
changes no rules and no schema.

**Regression test.** Kotlin unit test with a fake `AccountActions`: given `isAccountDeletionPending`
returns true, the Settings state exposes the recovery affordance; invoking it calls the clear method
and then `ensureSeeded`. Plus an emulator/rules test asserting an *unverified* owner can delete
`meta/accountDeletion` while `pendingDeletion` is true (web already has this at
`firestore.rules.test.ts:308` — the Android path needs the repository-level equivalent).

**Verification level:** Code-inspected (both clients traced end to end; the asymmetry is
structural, not conditional).
**Effort:** S

---

## 7. Medium Findings

### [AUS-002] The release workflow runs no tests, so a tag on a failing commit publishes an APK

**Severity: Medium**
**Confidence: High**
**Area: CI/CD**
**Affected files:** `.github/workflows/release.yml:17-147`

**Evidence.** The `release` job's steps are, in order: checkout, setup-java, setup-android,
`chmod +x gradlew`, restore signing material, derive version, `assembleProdRelease`,
`apksigner verify`, enable KVM, launch on emulator, publish, shred. There is no
`testProdDebugUnitTest`, no `lintProdDebug`, no `npm test`, no `test:rules`, no `test:emulator`,
and no dependency on the `ci.yml` workflow or on any check run. `ci.yml` triggers on push and
pull_request; a tag push runs `release.yml` independently.

**Trigger.** `git tag v1.2.3 && git push --tags` on any commit. Nothing consults whether that
commit's CI ever passed — or ever ran.

**Impact.** A release APK can be published from a commit with failing unit tests, failing lint,
failing rules tests, or a rules/index regression. The rules and index files are not even built by
this workflow, so a client change that depends on a rules change can ship with the old rules
deployed. The emulator launch step catches gross startup crashes and nothing else.

**Existing mitigation.** Genuinely non-trivial: the workflow *does* build the real R8 artifact and
*does* install and launch it on an API 29 emulator with a 12 s survival check
(`release.yml:112-128`), which is what catches the historical R8/keep-rule class of failure.
Branch protection may prevent red commits reaching `main`, but tags can point at any commit and
protection rules are not visible in the repository.

**Recommendation.** Two proportionate options, in preference order. (1) Gate on the same commit's
CI: add a first step that queries the check runs for `github.sha` via `gh api` and fails if the
required workflow did not conclude successfully. (2) Or re-run the fast suites inline before the
build — `./gradlew testProdDebugUnitTest lintProdDebug` plus `cd web && npm ci && npm test` adds a
few minutes to a workflow that already boots an emulator. Do not duplicate the emulator suites.

**Regression test.** Not unit-testable. Verify by pushing a throwaway tag on a branch with a
deliberately failing unit test and confirming the release job fails before `gh release create`.

**Verification level:** Code-inspected
**Effort:** S

---

### [AUS-003] APK signature verification proves a valid signature, not the expected key

**Severity: Medium**
**Confidence: High**
**Area: CI/CD / Supply Chain**
**Affected files:** `.github/workflows/release.yml:95-100`

**Evidence.**

```95:100:.github/workflows/release.yml
      - name: Verify the APK is signed
        run: |
          APK=app/build/outputs/apk/prod/release/app-prod-release.apk
          BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
          "$BT/apksigner" verify --print-certs "$APK"
          mv "$APK" "ausgegeben-${{ steps.version.outputs.name }}.apk"
```

`apksigner verify` exits 0 for *any* validly signed APK. `--print-certs` prints the certificate but
nothing compares it to an expected value, and no step greps the output. The signing config resolves
from `AUSGEGEBEN_KEYSTORE_BASE64` and friends; the earlier step only checks those secrets are
non-empty (`release.yml:44-54`).

This is not hypothetical confusion: `AGENTS.md` §3 records that a local throwaway keystore with
`CN=Test, OU=Test, O=Test` was mistaken for the release key, and that the published v2.0.0 APK is
signed `CN=Ausgegeben, O=shareef01`. The workflow cannot tell those apart.

**Trigger.** Anyone with repository admin re-pastes `AUSGEGEBEN_KEYSTORE_BASE64` from the wrong
backup, or the secret is rotated to a freshly generated keystore. The build succeeds, the signature
verifies, the release publishes.

**Impact.** Android refuses to update an installed app whose signing certificate differs. Every
existing user's update fails; the only path forward is uninstall-and-reinstall, which wipes local
DataStore state and the session (`AGENTS.md` §4 documents exactly this happening once, by a
different route). Cloud data survives, but the release is effectively unshippable and cannot be
walked back — the wrong-key APK is already published and the correct-key APK cannot replace it on
those devices either.

**Existing mitigation.** The secret-presence check prevents an *unsigned* release. `AGENTS.md`
documents the DN of the real key, so a maintainer who thinks to check can check.

**Recommendation.** Pin the fingerprint. Store the expected SHA-256 certificate digest as a
repository variable (it is not a secret — it is published in every APK) and fail the step if it
does not match:

```bash
FP=$("$BT/apksigner" verify --print-certs "$APK" | grep -i 'SHA-256 digest' | head -1 | awk '{print $NF}')
[ "$FP" = "${{ vars.EXPECTED_SIGNING_CERT_SHA256 }}" ] || { echo "::error::unexpected signing cert $FP"; exit 1; }
```

Also consider publishing a `sha256sum` of the APK alongside it so sideloaders can verify downloads.

**Regression test.** Not unit-testable. Verify by building locally with the throwaway keystore
(`keystore.properties`, `CN=Test`) and confirming the fingerprint comparison rejects it.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-004] The decrypted release keystore is on disk while a mutable-tag third-party action runs

**Severity: Medium**
**Confidence: Medium**
**Area: Supply Chain / CI/CD**
**Affected files:** `.github/workflows/release.yml:56, 112-113, 144-147`

**Evidence.** `release.jks` is written at `release.yml:56` and shredded only in the final
`if: always()` step at `release.yml:144-147`. Between those points the job runs
`reactivecircus/android-emulator-runner@v2` (`release.yml:113`) — a third-party action referenced by
a **mutable major tag**, executing in the same job, same workspace, with the keystore file present
and `AUSGEGEBEN_STOREPASSWORD` / `AUSGEGEBEN_KEYALIAS` / `AUSGEGEBEN_KEYPASSWORD` available to the
build step's environment. `permissions: contents: write` is also in scope.

`ci.yml` uses the same action but has no keystore on disk, so the exposure is specific to the
release job.

**Trigger.** The upstream `v2` tag is moved to a malicious commit, or the maintainer account of that
action is compromised. No action by this project is required.

**Impact.** Exfiltration of the production signing key and its passwords — the one asset in this
system whose compromise cannot be recovered by rotating a secret, because Android identity is the
certificate. An attacker holding it can sign APKs that install as updates over real users' apps.

**Existing mitigation.** The runner is ephemeral; the keystore is shredded at the end; the emulator
action is very widely used, which raises the cost of a supply-chain attack against it but does not
change what it *can* do. `verify --print-certs` runs before it, so the artifact is already built and
verified by the time the action runs.

**Recommendation.** Two small changes, both minimally invasive:
1. Move the shred to immediately after `Verify the APK is signed` — nothing after that step needs
   the keystore, since the APK is already built and renamed. Keep the `if: always()` shred as a
   backstop.
2. Pin `reactivecircus/android-emulator-runner` to a full commit SHA (with a comment recording the
   tag it corresponds to). This is the one third-party action in the tree and the only one worth
   the pinning overhead; see AUS-017 for the first-party actions.

**Regression test.** Not testable. Verify by inspecting a release run's step order.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-005] An unverified account can drain the project's entire daily Firestore read quota

**Severity: Medium**
**Confidence: High**
**Area: Firebase / Availability**
**Affected files:** `firestore.rules:220, 230, 242, 251`

**Evidence.** Reads are gated on ownership only, not on verification:

```229:237:firestore.rules
      match /expenses/{expenseId} {
        allow read: if isOwner(userId);
        allow create, update: if isOwner(userId)
          && isEmailVerified()
          && validExpense()
          && exists(/databases/$(database)/documents/users/$(userId)/categories/$(request.resource.data.categoryId))
          && expenseCategoryTypeMatches(userId);
        allow delete: if canDeleteOwned(userId);
      }
```

This is a deliberate and correct UX decision — the comment at `firestore.rules:12-13` says "Prefer
reads; require verification before mutating". The consequence is that sign-up alone, with no mailbox
access, yields a token that can issue unlimited queries against its own subtree. Firestore bills a
minimum of one document read for a query that matches nothing, so an empty account is not a free
account from the project's perspective.

Rejected requests (e.g. reading another user's subtree) are *not* billed, so the abuse has to run in
the attacker's own namespace — which the rules allow.

**Trigger.** A script creates one account via the public Identity Toolkit endpoint (App Check is
unenforced by design, so nothing attests the caller) and loops `getDocs(collection('users/<own
uid>/expenses'))`. Spark's 50,000 reads/day is reachable in minutes.

**Impact.** Availability, project-wide. When the daily read quota is exhausted, Firestore rejects
reads for *every* user until the UTC reset — the app opens to empty lists and error banners for
legitimate users. There is no billing to absorb overflow on Spark, which is the documented and
intended posture, so the quota is a hard cliff rather than a cost event. No confidentiality or
integrity impact whatsoever: the attacker reads only their own empty namespace.

**Existing mitigation.** Firebase applies its own per-IP rate limits to `signUp` and to the
Firestore REST/gRPC front end, which slows but does not prevent this. Writes and storage require a
verified email, which needs a real mailbox and is meaningfully harder. The app's own read discipline
(one-shot markers, shared listeners, the 30 s all-time cache) leaves substantial headroom, so a
*legitimate* user base is nowhere near the cliff.

**Recommendation.** Do not enable App Check enforcement — `AGENTS.md` §2 explains why that breaks
both clients, and this finding does not justify reopening it. Proportionate options that fit the
architecture: (a) accept the risk explicitly and add a Firebase usage alert at, say, 50 % of the
daily read budget so an attack is *observed* rather than discovered by users; (b) if you want a
rules-level lever, gate `list` on verification while leaving `get` open (`allow get: if isOwner(...)`
/ `allow list: if isOwner(...) && isEmailVerified()`) — but verify first that no pre-verification
screen performs a query, since the current UX shows a signed-in-but-unverified state.

**Regression test.** Rules test asserting the intended answer once you choose one: currently
"unverified owner can read own collection"; if you split get/list, "unverified owner can get a
document but cannot list the collection".

**Verification level:** Emulator-tested (the existing 38 rules tests confirm unverified reads
succeed); the quota arithmetic is Firestore-documented billing behaviour, not measured here.
**Effort:** XS (alert) / S (rules split)

---

### [AUS-006] Orphaned transactions are permanent, and Android silently drops them from the category breakdown

**Severity: Medium**
**Confidence: High**
**Area: Financial Integrity / Data Integrity / Parity**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/ui/InsightsViewModel.kt:145-148`;
`app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:283-305, 376-392, 703-728`;
compare `web/src/views/InsightsView.tsx:176-184`

**Evidence — two mechanisms, one user-visible symptom.**

*Orphans are created and then never repaired.* `deleteCategory` reassigns linked expenses to the
uncategorized sentinel twice (to narrow the TOCTOU window) and then deletes the category
(`AppRepository.kt:386-391`). `reassignExpenses` returns a count of documents it could not move —
and `reassignCategoryExpenses` discards that return value (`AppRepository.kt:703-705`), so the
category is deleted regardless. Any row the rules refuse, or any row attached to the category by
another device between the second reassign and the delete, is now an orphan. The repair sweep is
gated on a one-shot marker for cold starts (`AppRepository.kt:228`, and the marker is written even
when the repair only partially succeeded — deliberately, per the comment at
`AppRepository.kt:293-298`), so an orphan created *after* the first cold start is never swept
automatically.

*Android then hides the money instead of showing it.* `buildInsightsState` accumulates
`totalExpenses` over every scoped row, but maps per-category totals with `mapNotNull`:

```145:148:app/src/main/java/com/aus/ausgegeben/ui/InsightsViewModel.kt
    fun mapTotals(totals: Map<String, Double>): Map<Category, Double> =
        totals.mapNotNull { (categoryId, amount) ->
            categoryById[categoryId]?.let { it to CurrencyUtils.roundAmount(amount) }
        }.toMap()
```

A `categoryId` with no surviving category document resolves to `null` and the entire bucket is
dropped. The headline "Spent" figure still includes it. Web does the opposite — it keeps the slice
and labels it, at `InsightsView.tsx:180`: `name: cat?.name ?? '?'`.

**Trigger.** Device A opens Add Transaction and saves an expense into category X while device B (or
the same user on web) deletes category X. Or: an expense that fails `validExpense()` — a legacy row
with an out-of-allowlist field — lives in a category the user then deletes; `reassignExpenses`
counts it unfixable and `deleteCategory` proceeds anyway.

**Impact.** Numerical example. A month contains €1,000 of expenses, €150 of which sit in a category
that was deleted while a second device was writing to it. Android Insights shows "Spent €1,000.00"
in the summary dock and a donut whose centre reads €850.00 and whose percentages are computed
against 850 — so a €425 category is labelled 50 % when it is really 42.5 % of the month. Nothing
tells the user €150 is missing from the breakdown. Web, on the same data, shows a `?` slice worth
€150 and correct percentages. The two clients disagree about the same Firestore dataset.

Secondary effect: because `firestore.rules:234` requires the referenced category to exist on every
update, an orphaned expense is also **uneditable** on both clients until it is repaired.

**Existing mitigation.** Substantial, which is why this is Medium and not High. The double-reassign
narrows the race. `ensureUncategorizedCategory` guarantees the sink exists before reassignment.
The sentinel is only removed once nothing points at it (`AppRepository.kt:237-243`). Most
importantly the repair is **not** dead: `deduplicateCategories()` calls `sweepOrphanedExpenses`
unconditionally (`AppRepository.kt:280`) and that is wired to a user-facing "deduplicate categories"
action, so a manual recovery path exists — the marker gates the automatic cold-start scan only.
`softDeletedRows.test.ts` and `batchAtomicity.test.ts` cover adjacent behaviour.

**Recommendation.** Three small, independent changes:
1. Make Android surface orphans instead of dropping them: in `mapTotals`, fall back to a synthetic
   "unknown" category (the same string `R.string.record_unknown_category` already used by the CSV
   export) rather than `mapNotNull`. This makes the donut agree with the headline total and matches
   web.
2. ~~Make `deleteCategory` refuse to delete when `reassignExpenses` reports unfixable rows > 0, and
   surface that to the user ("some transactions could not be moved").~~
   **Withdrawn on implementation (2026-08-31) — this recommendation was wrong.** Both clients
   discard the count identically, so it is not a parity bug, and `reassignExpenses`'
   own contract states the reasoning explicitly: "the unfixable ones are counted rather
   than thrown: a row the rules will never accept must not keep blocking the ones they
   will" (`expenseRepository.ts:167-169`, mirrored in `AppRepository.kt`). Refusing the
   delete would let a single permanently-invalid legacy row block deleting a category
   forever — the same permanent-dead-end shape as AUS-001, which this audit rates High.
   Since item 1 removes the *silent* part (the amount now stays visible as `?` and the
   breakdown reconciles), the residual harm of proceeding is small and the deliberate
   trade-off stands. What was actually wrong was that Android threw the count away
   entirely, leaving orphans with no trace anywhere; it is now logged on both the
   `deleteCategory` and `deduplicateCategories` paths.
3. Consider running the orphan sweep when the *categories* listener first reports a set that does
   not cover every `categoryId` in the current month's expenses — a zero-extra-read trigger, since
   both lists are already in memory.

**Regression test.**
- Kotlin unit test on `buildInsightsState`: given one expense whose `categoryId` is absent from
  `categories`, assert `expensesByCategory.values.sum() == totalExpenses`. **Added.** Note that the
  existing test for this input asserted the opposite (`expensesByCategory.isEmpty()`), so the defect
  had a passing test defending it; that test was replaced rather than supplemented.
- ~~Emulator test asserting the category still exists after an unfixable row~~ — dropped with the
  withdrawn recommendation above.

**Verification level:** Code-inspected (both clients traced; Android unit-testable today via the
already-extracted pure `buildInsightsState`)
**Effort:** S

---

## 8. Low Findings

### [AUS-007] The smoke test reports success when error reporting is not configured at all

**Severity: Low**
**Confidence: High**
**Area: CI/CD / Observability**
**Affected files:** `web/scripts/smoke.mjs` (error-endpoint check); `.github/workflows/smoke.yml`

**Evidence.** The error-reporting probe is recorded as a *soft* check, and when the bundle contains
no `VITE_ERROR_REPORT_URL` at all the probe records `ok: true` with a "not configured (skipped)"
note. Both outcomes count toward the "N/N checks passed" tally, so a deploy that silently drops the
environment variable produces an all-green smoke run. `docs/audit-summary.md` records that this
exact misconfiguration went unnoticed for a period and was fixed by setting the variable — not by
hardening the check, which still cannot fail for this cause.

**Trigger.** Deploy from an environment where `.env.production` lacks `VITE_ERROR_REPORT_URL`
(it is gitignored and hand-maintained), or where the Cloudflare Worker's `ALLOWED_ORIGINS` no longer
lists the site.

**Impact.** Crash reporting goes dark and the monitoring that exists to notice such things reports
success. No user-facing impact; the cost is that the next production-only failure is invisible,
which is the precise failure pattern `AGENTS.md` §1 is built around.

**Existing mitigation.** Errors are always logged to the browser console regardless, and
`errorReporter.ts` buffers the last 20 reports for replay, so nothing is lost locally.

**Recommendation.** Make "configured" the asserted state for production: fail (not skip) when the
production bundle contains no report URL, and keep the origin-acceptance probe soft. That inverts
the default so absence is the alarm.

**Regression test.** Extend the existing `errorSink.test.ts` pattern with a smoke-script unit test
that feeds it a bundle string with and without the URL and asserts the check fails in the absence
case.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-008] Android and web render the same amount with different separators and symbol placement

**Severity: Low**
**Confidence: High**
**Area: Parity / Web / Android**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/util/CurrencyUtils.kt` (`localeFor`,
`formatAmount`); `web/src/utils/currency.ts` (`formatAmount`)

**Evidence.** Android derives the formatting locale from the **currency** (EUR → `de_DE`,
USD → `en_US`, GBP → `en_GB`, CHF → `de_CH`) and formats with `DecimalFormat` in that locale. Web
formats with `Intl.NumberFormat` using the **app language** (`en` or `de`) and
`style: 'currency'`, with a comment stating this is intentional — "not currency→locale heuristics".
Both choices are defensible; they are not the same choice.

**Trigger.** Any English-language user with EUR selected — the default currency.

**Impact.** €1,234.56 renders as `1.234,56 €` on Android and `€1,234.56` on web for the same user
and the same document: different decimal separator, different grouping separator, different symbol
position. Display only — the stored value is identical and no arithmetic differs — but for a finance
app used on both clients side by side it reads as a bug and undermines trust in the numbers.

**Existing mitigation.** `CurrencyUtilsTest` (5 tests) and `currency.test.ts` (13 tests) each lock
in their own platform's behaviour, so this is stable rather than drifting.

**Recommendation.** Pick one rule and document it in `AGENTS.md` as a deliberate decision, then make
the other client follow. Formatting by app language (web's current behaviour) is the more defensible
of the two — a German-language user with USD selected reasonably expects German number formatting —
and it is the cheaper change, since Android already has the locale available from
`preferenceManager`. If the currency→locale mapping is preferred instead, say so explicitly, because
the web comment currently argues against it.

**Regression test.** A shared table of (amount, currency, language) → expected string, duplicated
as one Kotlin and one vitest case list, so the two suites assert identical output.

**Verification level:** Code-inspected
**Effort:** S

---

### [AUS-009] CSV amount formatting diverges between clients

**Severity: Low**
**Confidence: High**
**Area: Data Portability / Parity**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/util/ExportUtils.kt:58`;
`web/src/utils/analytics.ts:162`

**Evidence.** The two exports agree on everything except the amount cell: same header
(`date,time,type,category,note,amount`), same `yyyy-MM-dd` / `HH:mm` local-time formatting, same
escaping rules, same `\n` join, no BOM, no trailing newline — `analytics.ts:152` even documents the
intended parity. But Android emits `expense.amount.toString()` (Kotlin `Double.toString`) and web
emits `String(e.amount)`.

**Impact.** A €5.00 expense exports as `5.0` from Android and `5` from web. An amount of
10,000,000.00 — permitted, since the rules cap at 1e9 and the keypad at 9 integer digits — exports as
`1.0E7` from Android and `10000000` from web, because Java switches to scientific notation at 1e7
while JavaScript does not until 1e21. Spreadsheets parse all four forms to the correct number, so
this is not lossy; it does mean two exports of the same account are not diffable, and any future
importer must handle both.

**Existing mitigation.** `ExportUtilsTest` (4 tests) and the web analytics tests cover escaping;
neither asserts cross-platform equality of the amount cell.

**Recommendation.** Format the amount cell explicitly and identically on both sides — two decimals,
`.` separator, no grouping, no exponent: `String.format(Locale.US, "%.2f", amount)` on Android and
`amount.toFixed(2)` on web. This also removes the exponent case entirely.

**Regression test.** A shared fixture list of amounts (`5`, `0.01`, `1234.5`, `10000000`,
`999999999.99`) asserted to produce byte-identical cells in both suites.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-010] Web CSV escaping omits carriage return from its quoting test; Android includes it

**Severity: Low**
**Confidence: Medium**
**Area: Data Portability / Parity**
**Affected files:** `web/src/utils/analytics.ts:146-150`; compare
`app/src/main/java/com/aus/ausgegeben/util/ExportUtils.kt:88-96`

**Evidence.**

```146:150:web/src/utils/analytics.ts
export function csvEscapeField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}
```

The quoting predicate is `/[",\n]/` — no `\r`. Android's equivalent tests all four:
`safe.none { it == ',' || it == '"' || it == '\n' || it == '\r' }`. Both treat a *leading* `\r` as a
formula trigger, so the asymmetry is only about quoting a `\r` that appears anywhere in the field.

**Trigger.** A note containing a bare CR without a following LF is exported from web. Browsers
normalise textarea values to LF, so the realistic source is a note written by some other client or
pasted through a path that preserved CR — low likelihood, which is why this is Low/Medium and not
higher.

**Impact.** The field is emitted unquoted with a raw CR inside it. Strict CSV parsers and Excel
treat a bare CR as a record separator, so one transaction becomes two malformed rows and the columns
after the break shift — a corrupted export rather than a security issue (the formula-injection
prefix still applies).

**Existing mitigation.** Formula-trigger prefixing is correct and symmetric on both platforms; the
`\n` and `"` cases, which are the reachable ones, are handled.

**Recommendation.** Change the web predicate to `/[",\n\r]/`. One character, restores parity.

**Regression test.** `analytics.test.ts`: `csvEscapeField('a\rb')` returns `"a\rb"` (quoted).

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-011] A release build hard-crashes on launch if App Check provider installation fails

**Severity: Low**
**Confidence: Medium**
**Area: Android / Availability**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/AusgegebenApplication.kt:74-107`

**Evidence.** `installAppCheck()` runs in `Application.onCreate`. In release builds a null factory
raises `error("App Check provider required in release")` (line 80) and any exception from
`installAppCheckProviderFactory` is rethrown rather than logged (lines 100-105). Debug builds log
and continue. An uncaught throw from `Application.onCreate` is an immediate process crash before any
UI exists.

`resolveAppCheckFactory()` returns `PlayIntegrityAppCheckProviderFactory.getInstance()` in release,
which is not null, so the `error(...)` branch is unreachable; the live risk is the rethrow.

**Trigger.** `installAppCheckProviderFactory` throwing on some device/Play-services combination.
Not observed here, hence Medium confidence — this is a latent fail-closed path, not a reproduced bug.

**Impact.** If it ever fires, the app cannot start at all — and it would fail closed on behalf of a
subsystem that `AGENTS.md` §2 documents as **deliberately unenforced project-wide**. The web client
takes the opposite stance for the same subsystem: it initialises App Check and tolerates a 403.
Trading total unavailability for a feature that is switched off is the wrong side of that trade.

**Existing mitigation.** `release.yml:112-128` and the CI release job install and launch the signed
APK on an API 29 emulator, so a deterministic crash here would be caught before publication. A
device-specific crash would not be.

**Recommendation.** Log and continue in release as well, matching the web client and the documented
posture that App Check is not a security boundary here. Keep the debug-only diagnostics as they are.

**Regression test.** Unit-test the factory-resolution/install helper with an injected throwing
installer and assert it does not propagate. (Requires extracting the two lines behind a small
seam — worth it, since this code cannot otherwise be exercised off-device.)

**Verification level:** Code-inspected; release-built (R8 output confirmed, launch not run locally)
**Effort:** XS

---

### [AUS-012] Reminders keep firing at the old wall-clock time after a timezone change

**Severity: Low**
**Confidence: High**
**Area: Android / Notifications**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/notification/ReminderScheduler.kt`;
`app/src/main/AndroidManifest.xml` (receivers)

**Evidence.** The daily reminder is a `PeriodicWorkRequest` with a 24 h interval and an initial delay
computed from the current timezone (`millisUntilNextReminder`, which handles DST by rolling a skipped
local time forward). WorkManager does not re-anchor a periodic request to local wall-clock time; it
repeats every 24 h from the first run. Rescheduling happens when preferences change while the app is
running, or on next launch — `MainActivity` reschedules from the synced-preferences effect. The
manifest declares `RECEIVED_BOOT_COMPLETED` handling for reboot, but there is **no**
`android.intent.action.TIMEZONE_CHANGED` receiver anywhere in the tree.

**Trigger.** Fly from Berlin to New York, do not open the app.

**Impact.** The 20:00 reminder arrives at 14:00 local until the app is next launched or the reminder
setting is touched. Same one-hour drift across a DST boundary. Cosmetic for a nudge notification;
listed because it is a real, permanent-until-relaunch behaviour and cheap to fix.

**Existing mitigation.** `ReminderSchedulerTest` (5 tests) covers the delay computation including the
DST roll-forward; `CANCEL_AND_REENQUEUE` makes rescheduling idempotent, so no duplicate jobs
accumulate (§33's duplicate-job concern is genuinely handled).

**Recommendation.** Add a manifest receiver for `ACTION_TIMEZONE_CHANGED` (and optionally
`ACTION_TIME_CHANGED`) that re-enqueues with `CANCEL_AND_REENQUEUE`, reusing the existing scheduler
entry point. No new permission is required.

**Regression test.** Extend `ReminderSchedulerTest` with a case asserting the computed delay for the
same configured hour differs after switching the default `TimeZone`, and that the scheduler is
invoked by the receiver path.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-013] Orphan repair scans an arbitrary 5,000-document window

**Severity: Low**
**Confidence: High**
**Area: Data Integrity / Firebase**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:711-728`

**Evidence.** `repairOrphanedExpenses` reads `expCol(u).limit(ALL_EXPENSES_CAP)` — 5,000 — with **no
`orderBy`**. Firestore's implicit ordering is by document name, and document IDs are
`UUID.randomUUID()`, so the window is an arbitrary lexicographic slice rather than, say, the most
recent 5,000. `expenseDocsForCategory` (used by `deleteCategory`) is by contrast uncapped, which is
the right choice there.

**Impact.** On an account with more than 5,000 expenses, orphans outside the scanned slice are never
repaired, and the marker is written as though the scan completed (deliberately — see the comment at
`AppRepository.kt:293-298`). Combined with AUS-006, those rows stay orphaned, stay uneditable, and
stay missing from Android's breakdown. A personal account reaching 5,000 transactions is plausible
over several years at ~2–3/day.

**Existing mitigation.** The cap exists to protect the Spark read quota, which is a legitimate and
documented constraint; the truncation is surfaced elsewhere in the UI via `dataTruncated`, and the
manual "deduplicate categories" action re-runs the sweep.

**Recommendation.** Do not raise the cap. Instead make the window deterministic and useful —
`orderBy("dateMillis", DESCENDING).limit(ALL_EXPENSES_CAP)` — so the rows a user can actually see and
edit are the ones repaired, and record in the marker whether the scan was truncated so a later pass
can resume. Same change on the web side for parity.

**Regression test.** Emulator test seeding more documents than the cap with an orphan among the
oldest, asserting the marker records truncation.

**Verification level:** Code-inspected
**Effort:** S

---

### [AUS-014] The signing-material export workflow is still in the tree

**Severity: Low**
**Confidence: High**
**Area: Supply Chain / Secrets**
**Affected files:** `.github/workflows/export-signing-material.yml`

**Evidence.** A `workflow_dispatch` workflow reads the keystore secrets, encrypts them with
AES-256 under a `RECOVERY_PASSPHRASE` secret, and uploads the ciphertext as a workflow artifact.
Artifacts of a public repository are downloadable by anyone with the URL. The file's own comments
describe it as temporary and say it should be deleted once the backup is verified.

**Impact.** No privilege escalation — an attacker who could run this workflow already has Actions
write access and could exfiltrate the secrets directly. The residual risk is that any artifact
produced by past runs was, for its retention window, a publicly fetchable offline brute-force target
whose only protection is the passphrase's entropy. Leaving the workflow present also leaves the
`RECOVERY_PASSPHRASE` secret meaningful and invites a repeat run.

**Existing mitigation.** Encryption at rest in the artifact; manual dispatch only; the maintainer
already flagged it for deletion.

**Recommendation.** Delete the workflow, delete any artifacts it produced, and remove the
`RECOVERY_PASSPHRASE` secret. Keep the keystore backup where backups belong — offline, in a password
manager or encrypted vault — not in CI.

**Regression test.** None applicable.

**Verification level:** Code-inspected
**Effort:** XS

---

### [AUS-015] README test counts understate the suite by 60 tests

**Severity: Low**
**Confidence: High**
**Area: Documentation**
**Affected files:** `README.md:169-177`

**Evidence.** Measured at HEAD versus claimed:

| Suite | README | Actual | How measured |
|---|---:|---:|---|
| Web unit | 69 | **75** | `npm test` → "75 passed (75)" |
| Android unit | 116 | **129** | forced `--rerun-tasks`; JUnit XML sums to 129, 0 failures |
| Repository (emulator) | 44 | **44** | `npm run test:emulator` → "44 passed (44)" |
| Firestore rules | 38 | **38** | `npm run test:rules` → "38 passed (38)" |
| Instrumentation | 8 | **9** | `@Test` count in `app/src/androidTest` (6 + 2 + 1) |
| **Total** | **235** | **295** | |

Two further inconsistencies. The README's own table **sums to 275**, so the headline figure of 235
disagrees with the rows directly beneath it regardless of what the code contains. And `AGENTS.md` §5
annotates its commands with "37 rules tests" and "39 repository tests" against actual counts of 38 and
44 — so the drift is in both documents, and in the file that the project treats as authoritative for
agents.

**Impact.** Documentation only, and the README already hedges ("counts as of 2026-08-27; CI's own
numbers are authoritative — these have drifted before"), which is why this is Low rather than
ignored: the hedge is honest but the drift is now 25 %, and an internally inconsistent table is worse
than a stale one because neither number can be trusted as the intended value.

**Recommendation.** Either drop the per-suite numbers and link to the CI run, or have CI emit them.
The stale-count problem does not deserve a script; deleting the numbers is the cheaper fix. Update the
two counts in `AGENTS.md` §5 at the same time, or drop them likewise.

**Verification level:** Unit-tested / Emulator-tested (all four suites executed for this audit)
**Effort:** XS

---

### [AUS-016] Error reports leave the device with no disclosure and no opt-out

**Severity: Low**
**Confidence: High**
**Area: Privacy / Documentation**
**Affected files:** `web/src/services/errorSink.ts:36-56`; `tools/error-endpoint/src/index.js:43-56`;
`README.md:189`

**Evidence.** I traced the payload precisely. `buildPayload` sends: `source`, `at`, the error's
`name`/`message`/`stack`, an optional `context` map, `location.pathname` (**not** search or hash),
`navigator.userAgent`, and `import.meta.env.MODE`. No UID, no email, no auth token, no transaction
amount, category or note. The call sites pass only structural context (`componentStack`, `filename`,
`line`, `column`, `during: 'bootstrapTheme'`). The worker truncates message to 500 and stack to
4,000 characters and writes to Cloudflare logs with no database. Sending is capped at 10 per session
with per-fingerprint dedupe, and is entirely disabled unless `VITE_ERROR_REPORT_URL` is set.

So the implementation is genuinely privacy-respecting — better than most. The gap is disclosure:
`README.md:189` says only "**Privacy:** no third-party analytics or trackers", which is true but
does not tell the user that unhandled errors, their stack traces, the page path and their user-agent
string are transmitted to a third-party-hosted endpoint. There is no in-app notice, no opt-out
toggle, and no privacy policy anywhere in the repository.

**Impact.** A user-agent string plus timing is weakly identifying; the substantive issue is that the
stated privacy posture is narrower than the actual data flow, and a user cannot decline. For an app
holding financial records, that mismatch matters more than the payload does.

**Existing mitigation.** The payload carries no financial or identity data; volume is capped; the
endpoint is first-party-operated (self-hosted Worker) rather than a vendor SDK; and it is off by
default in every build that does not set the variable.

**Recommendation.** Two lines of documentation and one toggle. State in the README (and ideally a
short in-app Settings note) exactly what an error report contains and where it goes; add a
`reportErrors` preference that gates `installConfiguredErrorSink()`. The preferences schema in
`firestore.rules:184-188` would need one more optional boolean if you want it synced — or keep it
local-only and avoid the rules change entirely, which is the smaller move.

**Regression test.** `errorSink.test.ts`: with the preference off, `installConfiguredErrorSink()`
returns false and no `sendBeacon`/`fetch` occurs even when a URL is configured.

**Verification level:** Code-inspected (payload construction and endpoint both read end to end)
**Effort:** S

---

### [AUS-026] The app's most important security property rests on a single test assertion

**Severity: Low**
**Confidence: High**
**Area: Testing / Security**
**Affected files:** `web/rules/firestore.rules.test.ts:126-132`

**Evidence.** Cross-user isolation is the property whose failure would be Critical, and the whole of
its automated coverage is:

```126:132:web/rules/firestore.rules.test.ts
    it('denies other users from reading owner expenses', async () => {
      const bob = testEnv.authenticatedContext('bob', { email_verified: true }).firestore();
      await assertFails(getDoc(doc(bob, expensePath('alice'))));
```

I grepped the entire rules suite for any second actor: `bob` appears on exactly these lines and
nowhere else. There is no test in which a foreign UID attempts `create`, `update`, `delete`, or a
collection `list`, and no cross-user test at all for `categories`, `settings/preferences` or `meta`.
That is one of the twenty cells in the permission matrix in §11.

**Trigger.** A future edit to `firestore.rules` that loosens ownership on a write path — for instance
adding a rule that reads a UID from document data instead of the path segment, or a `hasAny` helper
that accidentally widens a match. The suite would stay green.

**Impact.** No current defect: I read every rule and each is rooted at `isOwner(userId)` comparing
`request.auth.uid` to the path segment, so cross-user access is impossible at HEAD. The impact is
purely that the regression barrier protecting a Critical-severity property is one line thick, in a
project whose own history is a catalogue of green suites failing to predict production.

**Existing mitigation.** The rules are simple enough to audit by reading, and they are audited by
reading — this file has clearly had careful attention. `assertFails` on the read path proves the test
harness is wired correctly, so extending it is mechanical.

**Recommendation.** Add a parameterised block that, for each of the four subcollections, asserts a
foreign authenticated user is denied `get`, `list`, `create`, `update` and `delete`. That is roughly
20 assertions in one loop and it converts the audit-by-reading into an audit-by-CI.

**Regression test.** This finding *is* the test. Concretely:

```ts
for (const path of ['expenses/x', 'categories/y', 'settings/preferences', 'meta/dedupe']) {
  it(`denies bob every operation on alice/${path}`, async () => {
    const bob = testEnv.authenticatedContext('bob', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(bob, `users/alice/${path}`)));
    await assertFails(setDoc(doc(bob, `users/alice/${path}`), validPayloadFor(path)));
    await assertFails(deleteDoc(doc(bob, `users/alice/${path}`)));
  });
}
```

**Verification level:** Emulator-tested (suite executed; coverage gap established by grep)
**Effort:** XS

---

### [AUS-027] Android delete and duplicate are reachable only by gesture

**Severity: Low**
**Confidence: Medium**
**Area: Accessibility / Android / Parity**
**Affected files:** `app/src/main/java/com/aus/ausgegeben/ui/RecordScreen.kt:775-796, 346-347, 874-876`;
compare `web/src/components/SwipeableRow.tsx:80-137`

**Evidence.** A transaction row wires delete to a swipe and duplicate to a long press, with no button
for either:

```775:790:app/src/main/java/com/aus/ausgegeben/ui/RecordScreen.kt
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { 
            when (it) {
                SwipeToDismissBoxValue.EndToStart -> {
                    onDeleteRequest()
```

`confirmValueChange` returns `false` in both directions, so this is not a dismiss — it is a
gesture-only command channel. Duplicate is `onLongClick` (`RecordScreen.kt:346-347, 874-876`). Tap
opens edit, so edit has a non-gesture path; delete and duplicate do not. No `customActions` are
attached to the row's semantics.

The web client solves the same problem differently and accessibly: `SwipeableRow` renders
always-present action buttons with `aria-label`s *and* handles Enter/Delete on the row itself.

**Trigger.** Any Android user who cannot perform a horizontal swipe or a sustained long press —
motor impairment, tremor, switch access, an external keyboard, or a screen reader whose gesture set
is remapped.

**Impact.** Delete and duplicate become unavailable rather than merely awkward. Delete is the one
operation with no alternative route anywhere in the Android UI, so a transaction entered by mistake
cannot be removed at all without the gesture. The user's own data becomes unmanageable on the client
that is this project's primary distribution channel.

**Existing mitigation.** Edit remains reachable by tap, which lets a user correct a wrong amount or
category even if they cannot delete. TalkBack *may* surface the swipe through Compose's
`SwipeToDismissBox` semantics on some versions — I could not confirm this, which is why confidence is
Medium and why the finding is Low rather than higher.

**Recommendation.** Attach explicit semantics actions to the row rather than restyling it — this
preserves the intentional visual design while giving assistive technology and keyboards a real path:

```kotlin
Modifier.semantics {
    customActions = listOf(
        CustomAccessibilityAction(deleteLabel) { onDeleteRequest(); true },
        CustomAccessibilityAction(duplicateLabel) { onDuplicate(); true },
    )
}
```

**Regression test.** Extend the existing instrumentation suite (which already covers touch targets
on an API 29 emulator) with a case asserting the row exposes custom accessibility actions for delete
and duplicate — `onNodeWithText(...).assert(hasAnyCustomAction())` style.

**Verification level:** Code-inspected. TalkBack gesture availability **requires device
verification** — on the AVD with a throwaway account, never the physical phone.
**Effort:** S

---

### [AUS-028] The Add Transaction loading overlay does not contain focus

**Severity: Low**
**Confidence: High**
**Area: Accessibility / Web**
**Affected files:** `web/src/views/AddTransactionView.tsx:67-68, 104-112`

**Evidence.** The focus trap is conditioned on `vm.ready`, and the not-ready branch returns early
with a full-screen overlay that has no `role="dialog"`, no trap and no labelled dialog element:

```104:112:web/src/views/AddTransactionView.tsx
  if (!vm.ready) {
    return (
      <div className="fixed inset-0 z-[200] safe-overlay bg-background/80 backdrop-blur-xl flex items-center justify-center" role="status" aria-live="polite">
        <div className="card--pro add-txn add-txn--loading">
          {t('loading')}
        </div>
      </div>
    );
  }
```

`useBodyScrollLock` is called before the early return so scrolling *is* locked, which makes the
inconsistency clearer: pointer scroll is blocked while keyboard focus is not.

**Trigger.** Open Add Transaction and press Tab before categories finish loading — a slow connection,
a cold Firestore listener, or a throttled device widens the window.

**Impact.** Focus moves to the shell behind an opaque blurred overlay, so a keyboard or screen-reader
user is operating controls they cannot see, in a UI that visually presents as modal. Transient and
recoverable, hence Low.

**Existing mitigation.** The overlay is correctly announced (`role="status"`, `aria-live="polite"`),
and the ready state traps focus properly. The window is short in normal conditions.

**Recommendation.** Render the loading state inside the same trapped dialog shell rather than as a
separate early return — swap the body for the loading card and let one `role="dialog"` element with
`useFocusTrap` cover both states. That also removes the duplicated overlay markup.

**Regression test.** A jsdom test asserting that while the view model is not ready, the rendered tree
contains a `role="dialog"` with the focus-trap hook active (or, more simply, that no early-return
branch bypasses `useFocusTrap`).

**Verification level:** Code-inspected
**Effort:** XS

---

## 9. Informational / Hardening

Items here are single-paragraph hardening notes rather than full findings, and carry no severity label.
Note on numbering: IDs are allocated in the order findings were established, and sections are ordered by
severity, so AUS-026 to AUS-028 appear in §8 above despite their higher numbers. IDs are stable
identifiers, not a reading order.

**[AUS-017] First-party actions use mutable major tags.** `actions/checkout@v7`,
`actions/setup-java@v5`, `actions/setup-node@v7`, `android-actions/setup-android@v4`. For GitHub-owned
actions this is normal practice and the residual risk is low; the one that matters is the third-party
emulator action in the release job, covered as AUS-004. No evidence of current compromise.
*Effort: XS if you choose to pin.*

**[AUS-018] Expense writes cost extra reads inside the rules.** Every expense create/update
evaluates `exists(.../categories/{categoryId})` (`firestore.rules:234`) and then, unless the category
is the `'0'` sentinel, `get(...)` on the same document inside `expenseCategoryTypeMatches`
(`firestore.rules:44-49`). Rules `get`/`exists` are billed document reads, so a single save costs up
to two reads on top of the write. This is the correct trade — it is what enforces referential
integrity and type agreement server-side — but it belongs in the quota model (§22). The
`accountDeletionPending` helper is well built by comparison: `canDeleteOwned` short-circuits on
`isEmailVerified()` so its `exists`+`get` pair only runs for unverified callers.

**[AUS-019] A verified account can exhaust the project's Spark storage.** The rules bound every
field's type and size but cannot bound document *count*. At roughly 3 KB per maximal expense
(2,000-char note plus the legacy and idempotency fields) and Spark's 20,000 writes/day, a single
verified account fills the 1 GiB storage allowance in about two and a half weeks, degrading the
project for everyone. Requires control of a real mailbox to get past `isEmailVerified()`, which is
the meaningful barrier. Inherent to client-direct Firestore without Cloud Functions; the
proportionate response is a Firebase usage alert, not an architecture change.

**[AUS-020] Deprecated Firestore persistence APIs.** `setPersistenceEnabled` and `setCacheSizeBytes`
are deprecated in the current Firebase BOM — four compiler warnings, at
`AusgegebenApplication.kt:38,42` and `FirestoreClient.kt:38,39`. The modern equivalent is
`setLocalCacheSettings(PersistentCacheSettings...)`. Functionally identical today. Worth changing
opportunistically, not urgently. I checked the related hazard and it is clean: settings are applied
before first use, and `clearOfflineCache` applies them to a genuinely fresh instance after
`terminate()`, so the `IllegalStateException` for late configuration cannot fire.

**[AUS-021] Android `parseAmount` would misread a dot decimal for EUR — but the UI prevents it.**
`CurrencyUtils.parseAmount` strips the non-decimal separator, so `"12.50"` with EUR selected (where
`,` is the decimal separator) would become `1250.00`. Web explicitly guards this case, commenting
that a single separator with 1–2 trailing digits is always a decimal point. I traced whether the
Android path is reachable and it is not: amount entry is keypad-only
(`AddTransactionScreen.kt:308-320`), there is no text field, and `NumericKeypadHelper.handleKeyInput`
always inserts the currency's own separator regardless of which key was pressed. **Not a live
defect.** Recorded because the function is public, is the natural place for a future paste or
voice-input path to land, and would fail with a silent 100× error if it ever were reached. Adding
web's guard is a defensive two-line change.

**[AUS-022] Analytics history depth differs.** Android offers 12 months of month options
(`PeriodUtils.kt:91`, `monthsBack: Int = 12`), web offers 14. Harmless; listed for the parity matrix.

**[AUS-023] versionCode edge cases fail loudly, except one.** `release.yml:68-80` validates
`^[0-9]+\.[0-9]+\.[0-9]+$` and rejects MINOR or PATCH above 99, but does not bound MAJOR: a major
above 214,748 overflows Android's signed 32-bit versionCode, which AGP rejects at build time rather
than silently wrapping. Leading zeros are the interesting case — `v1.08.3` makes bash arithmetic
expansion fail on the invalid octal `08` and the step exits non-zero, so it fails safe; but
`v1.010.5` *is* valid octal and yields 10805 instead of 11005, a silently lower code than `v1.10.5`.
All three require implausible tags. No change recommended beyond awareness.

**[AUS-024] Bundle and precache size.** The production build warns that a chunk exceeds 500 KB, and
the service worker precaches 40 entries / 1,522 KiB. `manualChunks` already splits `firebase` and
`react-vendor`, so the remaining bulk is application code plus `lucide-react`. Acceptable for a PWA
of this scope; revisit with route-level dynamic imports only if first-load latency becomes a real
complaint.

**[AUS-025] CSV exports carry no timezone.** Both clients write local-time `date` and `time` columns
with no offset column and no UTC variant. The two clients agree with each other and with the app's
local-calendar month bucketing, so this is self-consistent; it does mean the same transaction exports
with a different date depending on where the export was taken. One extra column, or a documented
note, would close it.

---

## 10. Financial Correctness Review

### Semantics and sign convention

**There are no signed amounts.** `firestore.rules:95-97` requires `amount is number && amount > 0 &&
amount < 1000000000`, so direction is carried entirely by `transactionType ∈ {expense, income,
transfer}`. This single decision eliminates the whole "expense counted as income" bug family, because
no arithmetic can flip a sign — a misclassification would have to be a wrong *type string*, which the
rules constrain to three values and both clients set from an enum.

Formulas, taken from source and verified identical in intent across clients:

```
totalExpenses(P)  = Σ { a.amount | a ∈ P, a.transactionType = 'expense' }        → round2
totalIncome(P)    = Σ { a.amount | a ∈ P, a.transactionType = 'income'  }        → round2
totalTransfers(P) = Σ { a.amount | a ∈ P, a.transactionType = 'transfer'}        → round2
net(P)            = round2(totalIncome(P) − totalExpenses(P))
categoryTotals(P, type) = Σ per categoryId, filtered to that type               → round2 per bucket
cashFlow(P)       = per-bucket income/expense sums over P \ transfers           → round2 per bucket
budgetProjection  = serverSum(expense, thisMonth, excluding just-saved id) + newAmount
budgetBar(Android)= Σ { a.amount | a ∈ monthListenerRows, a is expense }
P                 = rows in period, deleted == false, not locally soft-hidden
```

**Transfers are excluded from spending and from cash flow, and are never double counted.** Web
`computeCashFlowTrend` filters `!isTransfer(e)` up front (`analytics.ts:96`); Android
`computeSpendingInsights` and `computeDayTotals` both `continue`/filter on `isTransfer()`
(`PeriodUtils.kt:236, 263`). Transfers appear only in their own total and their own breakdown card.
A transfer is a single document, not a pair, so there is no double-entry to double count.

### Audited failure modes

| Risk | Finding |
|---|---|
| Expense counted as income / vice versa | Impossible without a wrong type string; type is enum-sourced and rules-bounded. |
| Transfer counted toward spending | No — filtered on both clients. |
| Transfer counted twice | No — one document per transfer. |
| Deleted transaction still counted | No — see the soft-delete matrix below. Verified across all paths. |
| Duplicate transaction double counting | Guarded by `idempotencyKey`: the repository queries for an existing key before inserting (`AppRepository.kt:435-441`, web equivalent), so a retried or crash-replayed save collapses onto one row. |
| Category reassignment altering historical totals | Reassignment changes only `categoryId`; period totals are type-scoped, so headline figures are unaffected. Breakdown attribution moves, which is the intended semantics of reassignment. |
| Orphan excluded unexpectedly | **Yes on Android** — AUS-006. |
| Negative / zero amounts | Rejected by rules (`amount > 0`) and by both clients before save. |
| NaN / Infinity | Rules reject both: `NaN > 0` is false and `Infinity < 1e9` is false. Clients cannot produce them — `parseAmount` returns null/none for unparseable input. |
| Enormous amounts | Capped three ways: rules `< 1e9`, Android keypad `MAX_INTEGER_DIGITS = 9`, web `sanitizeAmountInput`. |
| Float precision | Deliberate and consistently handled: every aggregation rounds to 2 dp at the boundary (`Math.round(x*100)/100` / `CurrencyUtils.roundAmount`). `0.1 + 0.2` accumulates to `0.30000000000000004` and rounds to `0.3`; `AmountRoundingTest` (3 tests) and `analytics.test.ts` (11) lock this in. Doubles hold cent-exact integers up to 2^53, so at €1e9 max there is no representable-precision risk. |
| Display vs stored rounding | Stored values are whatever the client parsed (2 dp by construction); display re-rounds. No drift. |
| Locale decimal parsing | Correct on both, by different means — see AUS-021 for the Android edge that the keypad-only UI prevents. |
| Month boundary errors | Identical local-calendar arithmetic on both clients — see §16 and the date table below. |
| Total vs projection disagreement | Both derive from the same period definition; the projection uses a server aggregate while the bar uses listener rows, and both exclude deleted. They can differ transiently by one just-saved row, which is exactly what `excludeExpenseId` exists to prevent. |

One cosmetic asymmetry, not a defect: web's `computeTotals` uses `else totalTransfers += amount`, so a
hypothetical unknown `transactionType` would land in transfers; Android's `when` has an explicit
`isExpense()` arm and would drop it. The rules make unknown types unwritable, so neither branch is
reachable.

### Money representation

| Layer | Representation |
|---|---|
| Firestore | IEEE-754 double (`amount is number`), value in major currency units, `0 < a < 1e9` |
| Android | `Double`, rounded to 2 dp via `CurrencyUtils.roundAmount` at every boundary |
| Web | `number` (double), rounded to 2 dp via `Math.round(x*100)/100` |
| CSV | decimal text — formatting differs, see AUS-009 |

Minor units (integer cents) would be the textbook choice and is *not* what this uses. For this value
range the practical difference is nil: doubles represent every cent value below 1e9 exactly once
scaled, and the code never accumulates without rounding at the boundary. **Editing a value created by
the other client is lossless** — both write the same double for the same cent value, and both parse
the stored double identically. I found no path where persisted money loses precision.

### Invariants — verified status

| # | Invariant | Status |
|---|---|---|
| 1 | A visible live transaction is counted exactly once | **Holds** |
| 2 | `deleted == true` contributes zero to live totals | **Holds** — every path checked (table in §14) |
| 3 | A transaction's category exists or maps to the sentinel | **Violated in a bounded way** — AUS-006 |
| 4 | Expense/category types agree except for the `'0'` sentinel | **Holds** — enforced server-side, `firestore.rules:44-49` |
| 5 | User A's data is never visible to user B | **Holds** — rules, verified + tested |
| 6 | A permanent rules rejection does not create an infinite retry loop | **Holds** — `reassignExpenses` counts unfixable rows; the marker is written anyway, by design |
| 7 | A cleanup marker is not committed before the state it represents | **Deliberately violated, correctly** — the marker records *that the scan ran*, not that every row was fixable; the comment at `AppRepository.kt:293-298` explains why, and a manual re-run exists |
| 8 | Completed reorder leaves no duplicate sort order | **Holds** — single atomic batch, busy-guard, 9 + 13 Android tests |
| 9 | Cross-client totals agree for the same dataset | **Holds numerically**; rendering differs (AUS-008) and Android's breakdown drops orphans (AUS-006) |
| 10 | CSV excludes logically deleted rows | **Holds** — both exports read filtered sources |

Project-specific invariants I would add: *(11)* the sentinel category `'0'` exists whenever any row
points at it — enforced by `ensureUncategorizedCategory` before every reassignment and by the
conditional cleanup at `AppRepository.kt:237-243`; *(12)* `Σ categoryBreakdown == periodTotal` for
each type — currently violated on Android only (AUS-006), and the cheapest possible regression test
for that class of bug.

---

## 11. Firestore Security Rules Review

Read line by line; all 38 rules tests executed green against the emulator during this audit.

**Structure.** `users/{userId}` is `allow read, write: if false` (`firestore.rules:217`). Rules v2 does
not cascade document permissions to subcollections, so each of `categories`, `expenses`, `settings`
and `meta` carries its own explicit grant and there is no implicit path to the parent. Default deny
applies to every unmatched path.

| Path | read | create/update | delete |
|---|---|---|---|
| `users/{uid}` | denied | denied | denied |
| `categories/{id}` | `isOwner` | `isOwner` + verified + `validCategory()` | `canDeleteOwned` |
| `expenses/{id}` | `isOwner` | `isOwner` + verified + `validExpense()` + category **exists** + type matches | `canDeleteOwned` |
| `settings/{docId}` | `isOwner` | `isOwner` + verified + `docId == 'preferences'` + `validPreferences()` | `canDeleteOwned` + `docId == 'preferences'` |
| `meta/{docId}` | `isOwner` | `dedupe`: verified + `validDedupeMarker()`; `accountDeletion`: `validAccountDeletion()` (**no verification**) | `canDeleteOwned` + docId ∈ {dedupe, accountDeletion} |

**Cross-user access.** Every rule is rooted at `isOwner(userId)`, which compares `request.auth.uid`
to the path segment. There is no rule anywhere that reads a UID from document data, from a claim, or
from a request field, so UID substitution has nothing to substitute — changing the path changes the
thing being compared. `get`, `list`, `create`, `update` and `delete` against another UID all fail.

The *rules* therefore hold by construction. The *tests* do not establish that nearly as broadly as I
first assumed: the entire cross-user suite is one assertion — `firestore.rules.test.ts:126-132`, in
which `bob` reads one of `alice`'s expense documents and is denied. There is no test in which another
user attempts a create, update or delete under a foreign UID, and none covering the other three
subcollections. See AUS-026.

**Unverified users** can read their own subtree and write exactly one document:
`meta/accountDeletion`. They cannot create or edit expenses, categories or preferences. This matches
the intended UX (a signed-in-but-unverified user sees the app and is prompted to verify) and is the
basis of AUS-005.

**Schema validation.** `validExpense()` and `validCategory()` both use `keys().hasOnly([...])` plus
`keys().hasAll([...])`, so unknown fields are rejected and core fields are mandatory, with type *and*
range bounds on each: `amount` positive and < 1e9; `dateMillis` inside 2000-01-01…2100-01-01;
`categoryId` a 1–63 char string; `note` ≤ 2,000 chars matching the clients' own caps; `colorInt`
inside signed-32-bit; `sortOrder` 0–9,999; `idempotencyKey` and `id` < 128/64 chars. Legacy fields are
allowlisted **and bounded** (`cloudId` < 128, `receiptImagePath` < 512, `deleted` must be bool), with
the comment at `firestore.rules:58-59` giving exactly the right reason: an unbounded allowlisted field
is free storage for anyone holding the public API key.

**`validPreferences()`** is the tightest of the three: currency and locale are closed enumerations,
`themeMode` is checked against a 10-value list, reminder hour/minute are range-bounded,
`analyticsPeriod` must match `^month:[0-9]{4}-(0[1-9]|1[0-2])$` or one of three literals, and
`updatedAt` must be positive and **less than `request.time.toMillis() + 86400000`**. Arbitrary field
insertion, an unsupported currency, an invalid period and an oversized value are all rejected.

**The `meta` privilege question** (§10 of the brief) deserves a direct answer. `meta/accountDeletion`
grants extra power: setting `pendingDeletion: true` makes `canDeleteOwned` true, which enables delete
on expenses, categories, settings and meta **without email verification**. I checked whether this can
be abused to reach outside the account: it cannot. `accountDeletionPending(userId)` reads the marker
under the *same* `userId` path segment that `isOwner` already constrained, so the escalation is
strictly self-scoped — an unverified owner can delete their own data, which is precisely the wipe path
it exists for. The one real consequence is that the state is persistent and unversioned: an account
left with the marker set keeps the weakened delete gate indefinitely, which is one more reason to fix
AUS-001. `canDeleteOwned` is also well-ordered for cost: `isEmailVerified() ||
accountDeletionPending(...)` short-circuits so the `exists`+`get` pair only runs for unverified
callers.

**`validDedupeMarker()`** bounds the marker to three keys with `hasAny` requiring at least one
meaningful one — so it cannot be used as a scratch document.

**Findings from the rules review:** AUS-005 (unverified read quota) and AUS-018 (read cost of the
referential-integrity checks). No security defect.

---

## 12. Firestore Index Review

| Query / function | Shape | Required index | Declared | Risk |
|---|---|---|---|---|
| `allExpenses` (both clients) | `orderBy(dateMillis DESC).limit(N)` | single-field (automatic) | n/a | none |
| `getExpensesInRange` / `onExpensesInRange` | `dateMillis >= s`, `< e`, `orderBy dateMillis` | single-field (automatic) | n/a | none |
| `insertExpense` idempotency probe | `idempotencyKey ==`, `limit 1` | single-field (automatic) | n/a | none |
| `expenseDocsForCategory` | `categoryId ==` (string and numeric passes) | single-field (automatic) | n/a | none |
| `sumMonthExpenses` live pass | `transactionType ==`, `dateMillis >=`, `<`, **`sum(amount)`** | `(transactionType, dateMillis, amount)` | ✅ declared | none |
| `sumMonthExpenses` deleted pass | `+ deleted ==`, **`sum(amount)`** | `(transactionType, deleted, dateMillis, amount)` | ✅ declared | none |
| `allCategories` | `orderBy(sortOrder)` | single-field (automatic) | n/a | none |
| `deduplicateCategories` | `catCol.get()` unfiltered | none | n/a | none |

**Every current query is covered.** Critically, both aggregation indexes include the *aggregated*
field `amount`, not merely the filtered fields — the subtlety that `AGENTS.md` §3 records as having
been wrong once and silently broken in production. The code comments at
`expenseRepository.ts:631-636` and `AppRepository.kt:511-516` now state the rule explicitly at both
call sites, which is the right place for it.

Two declared indexes appear **unused** by any query shape I could find:
`(idempotencyKey, dateMillis DESC)` — the probe is a single-field equality with `limit(1)` — and
`(transactionType, dateMillis DESC)`, since both clients filter type client-side on purpose to avoid a
second listener. Unused composite indexes are not a correctness problem; they add a small write
amplification per expense and could be removed after confirming no query needs them.

**What emulator testing cannot prove here** (§68): the emulator creates indexes on demand, so all 44
repository tests pass regardless of `firestore.indexes.json`. Declared ≠ deployed ≠ `READY`.
`AGENTS.md` §3 records both aggregation indexes as confirmed serving on 2026-08-06 by adding a real
expense with a budget set and reading an empty logcat. **Requires production/device verification** for
any future change to an aggregate query: deploy indexes first (`npm run deploy:rules` covers indexes),
wait for `READY`, then ship the client.

---

## 13. Legacy Data Compatibility

| Legacy shape | Android read | Web read | Current write | Rules | Financial effect | Tested |
|---|---|---|---|---|---|---|
| `cloudId` (expense, string) | ignored | ignored | never written; **re-sent** by web `updateExpense` spread | allowed, < 128 chars | none | rules ✅ |
| `categoryCloudId` (string \| number \| null) | ignored | ignored | never written; re-sent by web spread | allowed, all three types | none | rules ✅ |
| `receiptImagePath` (string \| null) | ignored | ignored | never written | allowed incl. null | none | rules ✅ |
| `deleted: true` (expense) | filtered out of every read path | filtered out | never written | allowed, bool | **excluded from all totals** | ✅ dedicated `softDeletedRows.test.ts` |
| `updatedAt` as `Timestamp` | coerced by `expenseFromDoc` | tolerated | writes number | `is number \|\| is timestamp` | none | rules ✅ |
| `categoryId` as number | **normalised to string** | **not normalised** | writes string | rules require string on write | breakdown/name lookup misses on web | partial |
| `cloudId` (category) | ignored | ignored | never written | allowed | none | rules ✅ |
| `deleted` (category) | ignored | ignored | never written | allowed | none | rules ✅ |
| Category missing `iconName`/`colorInt` | defaulted (`"shopping_bag"`, `0xff6a9fd4`) | **not defaulted** | n/a | `hasAll` blocks writing such a row | UI only | partial |
| Category missing `sortOrder` | defaulted; repaired by dedupe | repaired by dedupe | n/a | `hasAll` requires it | ordering | ✅ |
| Expense with no core fields (3 exist per `AGENTS.md`) | `expenseFromDoc` yields defaults, filtered | tolerated | never written | unwritable | inert | — |

**The two partial rows are the honest gaps, and both are narrow.** `categoryFromDoc`
(`AppRepository.kt:744-749`) coerces every field with a default, and `expenseFromDoc` normalises a
numeric `categoryId` to its string form; the web repository returns Firestore data as-is. If a legacy
expense still carries a numeric `categoryId`, Android resolves the category and web does not — the
name renders as unknown, and the row is excluded from web's breakdown map key it should share. I could
not establish that such rows still exist in this account's production data (that is **Requires
production verification**: read a handful of documents and check `typeof categoryId`), and the orphan
sweep plus `expenseDocsForCategory`'s deliberate numeric pass suggest they were migrated. Marked
*Needs verification* rather than reported as a live defect.

**Can legacy documents still become permanently unwritable?** Only by tightening the rules. The
current allowlists were measured against real accounts (the counts in the rules comments), and both
`hasOnly` lists include every field observed in the wild. The failure mode to guard against is a future
field addition that forgets the merged-document semantics of `hasOnly` — which is what bit this project
twice. A cheap standing guard: keep at least one rules test per legacy shape (they exist) and add a
test that a *merge* write to a row carrying all four legacy expense fields succeeds.

---

## 14. Deletion / Cleanup / Migration Review

### Soft-delete consistency

| Path | Excludes `deleted == true`? | Where |
|---|---|---|
| `allExpenses` (Android) | ✅ | `AppRepository.kt:576-578` |
| `getExpensesInRange` (Android) | ✅ | `AppRepository.kt:410-412` |
| `getAllExpensesCapped` (web) | ✅ | repository filter |
| `onExpensesInRange` (web) | ✅ | repository filter |
| Month total / budget bar | ✅ | derives from the filtered month listener |
| Budget projection (`sumMonthExpenses`) | ✅ | subtracts the deleted-subset aggregate, both clients |
| Insights totals + breakdown + cash flow | ✅ | consumes filtered listeners |
| Record list, search, day totals | ✅ | same source |
| CSV export | ✅ | reads `allExpenses` / `getAllExpensesCapped` |
| Duplicate | ✅ | operates on a visible row |
| Orphan repair | intentionally **skips** deleted rows | `AppRepository.kt:716-720` — repointing rows nothing reads would only spend writes |

This is the question `AGENTS.md` records as having been half-fixed once (the month total still counted
deleted rows after the first attempt). **It is now consistent everywhere**, including the aggregate
path, and there is a dedicated `softDeletedRows.test.ts`. This is one of the strongest parts of the
audit result.

### Delete-with-undo

Both clients use the same design, and my earlier assumption that Android differed was wrong: Android
hides the row locally (`_softDeletedIds`, `ExpenseViewModel.kt:200-223`) and only issues the Firestore
delete in `commitSoftDelete` after the snackbar window; web does the same via `softDeletedIds` and the
toast's dismiss callback (`useRecordViewModel.ts:254-274`). Undo therefore never needs to recreate a
document and cannot mint a new ID. On failure both unhide the row. Correct on both sides.

### Migrations and repairs

| Repair | Precondition | Marker | Idempotent | Partial failure | Concurrency |
|---|---|---|---|---|---|
| Seed default categories | categories collection empty | none | yes (guarded by emptiness) | some categories created | `ensureSeeded` mutex/in-flight guard per uid |
| `deduplicateCategories` | `marker.categoriesDeduped !== true`, or manual | `dedupe.categoriesDeduped` | yes | some duplicates merged; rerunnable | per-duplicate sequential; TOCTOU narrowed by double reassign |
| Orphan sweep | marker unset, or manual, or after dedupe | `dedupe.orphansScannedAt` | yes | marker set anyway **by design** | capped read |
| Sentinel cleanup | sentinel exists **and** nothing references it | none | yes | no-op | re-checked each launch |
| Account wipe | reauth + `pendingDeletion` | `accountDeletion` | resumable in principle | see AUS-001 | marker survives |

**Can a marker say "done" when the repair did not complete?** Yes, for the orphan sweep — and this is
a deliberate, documented decision with a stated rationale (`AppRepository.kt:293-298`): a row the rules
will never accept must not cause a whole-collection read on every launch. I agree with the trade. The
mitigation that makes it acceptable is that `deduplicateCategories()` re-runs the sweep
unconditionally and is wired to a user-facing action, so the repair is reachable again. **Can a
pre-existing marker prevent a newly introduced repair from running?** For anything keyed on
`orphansScannedAt`, yes — every account that has cold-started has it set, which is exactly the trap
`AGENTS.md` records. Any *future* repair must use a new marker key, not reuse this one. That is a
process note rather than a current defect.

### Batch limits and atomicity

| Operation | Documents touched | Atomic? | Partial failure behaviour |
|---|---|---|---|
| Add / edit / delete one transaction | 1 | yes | n/a |
| Category reorder | all categories of one type | **yes** — single `writeBatch` | all-or-nothing; busy-guard prevents interleaving |
| Category delete | 1 + N reassigned expenses | **no** — chunks of 450, then the delete | healthy chunks land; unfixable rows counted but **the delete proceeds** → AUS-006 |
| Dedupe | per duplicate: N reassigns + 1 delete | no | rerunnable |
| Orphan repair | up to 5,000 reads + N writes | no | counted, marker still set |
| Account wipe | entire subtree | no | AUS-001 |
| Undo | 0 | n/a | nothing to undo |

Chunking is 450, comfortably under the 500-operation limit, and the fallback from a rejected batch to
per-document writes is the key design decision that prevents one poison row from stranding the rest.
`batchAtomicity.test.ts` (5 tests) covers the chunk boundaries.

### Poison-document failure mode (§41)

Searched every bulk path. The batch→per-document fallback in `reassignExpenses` (both clients) means a
single rules-invalid row can no longer abort a healthy batch, block the marker, or cause a retry every
launch — the three symptoms recorded in `AGENTS.md`. The residual consequences of a poison row are:
it stays uneditable (inherent — the rules are the gate), it is counted as `unfixable` and **the
category delete proceeds anyway** (AUS-006), and it occupies a slot in the capped all-history reads.
No path deletes malformed financial records, which is the right priority.

---

## 15. Android ↔ Web Parity Matrix

| Concern | Android | Web | Classification |
|---|---|---|---|
| Add expense / income / transfer | keypad-only entry, activity-scoped view model | text input with `sanitizeAmountInput` | implementation detail |
| Idempotency on save | `idempotencyKey` probe | identical | intentional parity |
| Edit | blocks save on category/type mismatch | **silently reassigns** `categoryId` when it does not match a visible category (`useAddTransactionViewModel.ts:98-102`) | probable drift — see note |
| Delete + undo | soft-hide then commit | soft-hide then commit | intentional parity |
| Duplicate | new id, copies amount/type/category/note/date | same; `duplicateExpense.test.ts` (4 tests) | intentional parity |
| Notes | 2,000-char cap | 2,000-char cap (`slice`) | parity, rules-enforced |
| Category CRUD + validation | `CategoryValidator` sanitize + validate | mirrored validator (4 tests) | intentional parity |
| Category reorder | busy-guard + single batch | busy-guard in `CategoriesView` + batch | intentional parity |
| Category delete / reassignment | double reassign → delete | double reassign → delete | intentional parity |
| Starter categories | `DEFAULT_CATEGORIES` seeded when empty | same | parity |
| Uncategorized sentinel hidden from pickers | ✅ | ✅ | parity |
| Currency / locale / budget / reminder settings | DataStore + LWW cloud sync | Zustand + LWW cloud sync | parity |
| Money **formatting** | currency → locale | app language | **confirmed defect** (AUS-008) |
| Money parsing | currency separator, naive | currency separator, guarded | UX-only today (AUS-021) |
| Month / period boundaries | local calendar via `Calendar` | local calendar via `Date` | parity — verified equivalent |
| Analytics history depth | 12 months | 14 months | UX-only (AUS-022) |
| Totals + breakdown + cash flow | same formulas, rounded per bucket | same | parity, except AUS-006 |
| Orphan handling in breakdown | **drops the bucket** | shows `?` | **confirmed defect** (AUS-006) |
| CSV columns / dates / escaping | identical | identical, except `\r` (AUS-010) | near-parity |
| CSV amount cell | `Double.toString()` | `String(n)` | **confirmed defect** (AUS-009) |
| Account deletion | no recovery affordance | banner + "keep account" | **confirmed defect** (AUS-001) |
| Legacy numeric `categoryId` | normalised | not normalised | probable drift (needs prod verification) |
| Missing category `iconName`/`colorInt` | defaulted | not defaulted | probable drift, UI-only |
| Offline writes | SDK queue; discarded on sign-out | SDK queue; discarded on sign-out | intentional parity |
| Truncation banner at 5,000 rows | ✅ | ✅ | parity |

On the "silently reassigns" row: the effect I traced is that when an expense's `categoryId` is not in
the currently visible (type-filtered, sentinel-excluded) list, web's effect resets it to
`filteredCategories[0]`. For an uncategorized row this quietly recategorises the transaction on open;
Android leaves the field unselected and refuses to save. `expenseRepository.ts:319-324` already
documents this behaviour as a known consequence of removing the sentinel, so it is on the maintainer's
radar; I list it as drift rather than a separate finding because AUS-006's recommendations (surface
orphans instead of hiding them) remove the condition that triggers it.

---

## 16. Offline / Synchronization Review

There is **no custom sync layer** — no local mirror, no sync-status column, no retry queue of the
project's own. Both clients write straight to Firestore and rely on the SDK's offline queue. That is
a large simplification and it removes entire bug classes (duplicate cloud upload, local-delete
resurrection, sync-flag drift). What remains:

| Scenario | Behaviour | Class |
|---|---|---|
| Same transaction edited on Android and web | last write wins at field granularity (`SetOptions.merge` / `merge: true`) | LWW by design |
| Delete vs edit | delete wins if it lands last; an edit landing after a delete recreates nothing (update on a missing doc fails) | safe / bounded |
| Delete vs duplicate | duplicate reads the in-memory row and writes a new id; source deletion does not affect it | safe |
| Category delete while adding into it | the added row can be orphaned | integrity risk — AUS-006 |
| Reorder from two clients | each writes one atomic batch; the later batch wins wholesale, so no duplicate `sortOrder` survives | safe / bounded |
| Settings from two clients | numeric `updatedAt` LWW, bounded to +24 h by rules | LWW by design |
| Account deletion while another device is online | the other device's listeners error; `ensureSeeded` will not re-seed | bounded (AUS-001) |
| Offline Android reconnects after web changed the same row | queued Android write applies on reconnect and overwrites the newer web value — **no timestamp comparison on expense writes** | LWW by design, worth documenting |
| Undo after another device deleted the row | undo only unhides locally; nothing is written | safe |
| Cleanup running on two devices at once | idempotent operations; worst case duplicated reads/writes | bounded |
| Sign-out with queued offline writes | `terminate()` + `clearPersistence()` **discards** them | accepted trade |

Two of these deserve a note rather than a finding. **Offline Android overwriting newer web data** is
genuine last-write-wins on wall-clock arrival order, not on `updatedAt`; for a single-user app editing
their own row this is the conventional and expected behaviour, and the alternative (rejecting stale
writes) needs `updatedAt` comparison in rules that legacy Timestamp rows would fail. I would leave it
and document it. **Discarding queued writes on sign-out** (`FirestoreClient.clearOfflineCache`,
`AuthRepository`) can lose a transaction the user saw as saved — but the alternative is flushing one
account's writes after another account has signed in, which is worse. The trade is correct; the gap is
that nothing warns the user. A pre-sign-out check for pending writes is not exposed by the SDK, so the
proportionate answer is a line in the sign-out confirmation when the device is offline.

**Error classification.** Both clients distinguish transient failure from permanent rejection where it
matters: `reassignExpenses` treats a rejected document as permanent and counts it rather than
retrying; `requireVerifiedEmail()` surfaces `EMAIL_NOT_VERIFIED` distinctly through to the UI; listener
errors set a health flag (`markListenerFailed`) that raises a banner instead of rendering an empty list
as "no data" — a genuinely good detail, since "listener failed" and "user has no transactions" look
identical otherwise. No infinite retry churn found.

---

## 17. Authentication & Account Lifecycle

**Provider: email/password only.** Verified — `EmailAuthProvider` is the only credential type in
either client; no federated providers, no anonymous auth. Documentation matches.

Flows reviewed on both clients: sign-up, sign-in, verification email, verification refresh
(`reloadCurrentUser` / `refreshUser` forcing a token refresh), unverified state, password reset,
sign-out, user switching, account deletion, Firebase-init failure.

**The verified-email gate is honoured on both sides of the boundary.** Rules require
`isEmailVerified()` for every mutation; both clients also check locally
(`requireVerifiedEmail()` / `EmailNotVerifiedError`) and surface a distinct message rather than a
generic save failure. This matters because the token carries a stale `email_verified` claim until
refreshed: a user who verifies in another browser or on another device would otherwise be stuck with
403s and no explanation. Both clients force a token refresh on the verification-refresh action
(`authService.ts:100`), which is the correct escape hatch. An offline unverified user attempting a
mutation gets the local error before any write is queued.

**Auth listener lifecycle.** Web installs one `onAuthStateChanged` listener at bootstrap and projects
into an immutable `AuthUser` with a `sameAuthUser` comparison to avoid re-render churn. Android exposes
`authState` as a `StateFlow` and `MainActivity` keys the preferences-sync lifecycle off
`currentUser?.uid`, so a UID change tears down and restarts sync. No duplicate listeners found on
either side.

**Cross-account isolation on sign-out** (§37) — traced and clean on both clients:

| Store | Android | Web |
|---|---|---|
| Auth state | `signOut()` → `authState` null | `setUser(null)` |
| Firestore listeners | `perUserFlow` re-keys on uid and `awaitClose` removes the listener | subscriptions torn down on uid change |
| Local prefs | `PreferenceManager.clearAccountLocalState()` removes account-scoped keys | `resetPreferences()` |
| Derived caches | n/a (no module-scope cache) | `invalidateAllExpensesCache()` |
| SDK offline cache | `terminate()` + `clearPersistence()` + fresh instance | `clearLocalFirestoreCache()` |
| In-memory UI state | ViewModels are activity-scoped and re-collect from empty flows | Zustand reset |

The all-time scan cache is keyed by uid **and** explicitly invalidated on sign-out, so the shared-browser
case is covered. I found no path where user A's data can surface for user B.

**Account deletion** is covered in AUS-001. Ordering is correct on both clients (reauthenticate →
mark pending → wipe → delete Auth user, with 3 retries), which fixes the historically worse ordering
described in the code comments. The wipe is not atomic and not automatically resumable; the marker
makes the incomplete state *detectable*, and web acts on that while Android does not.

---

## 18. Android Review

**Architecture.** Compose + Hilt + MVVM with repository interfaces (`ExpenseActions`,
`CategoryActions`, `AccountActions`, `TransactionPreferences`) that exist specifically to be faked in
unit tests — visible in the 129 passing unit tests, which reach view models and repositories rather
than only utilities.

**Flow discipline is good.** `ExpenseViewModel` uses `shareIn(replay = 1)` with
`WhileSubscribed(5000)` and deliberately reuses one month listener across three consumers
(`ExpenseViewModel.kt:91-121`), with a comment explaining the read-quota reason. `InsightsViewModel`
uses `flatMapLatest` on the period key so switching periods cancels the previous query, applies
`flowOn(Dispatchers.Default)` for the aggregation work, and uses a hand-written
`distinctUntilChanged` comparator so unrounded float artefacts cannot make equivalent states look
different (`InsightsViewModel.kt:168-195`). Pure functions (`buildInsightsState`,
`categoriesAfterMove`, `computeSpendingInsights`) are extracted specifically so the maths is testable
outside the Flow pipeline — the right instinct, and directly why AUS-006 has a cheap regression test.

**Checked and clean:** no `GlobalScope`; no Activity/Context captured in a repository (the one context
use is `localizedContext()` for a category name string); the search flow is debounced at 250 ms;
`perUserFlow` re-keys every listener on uid so a long-running coroutine cannot write under the wrong
UID; Firestore settings are applied before first use and re-applied only to a genuinely fresh instance
after `terminate()` (no late-configuration `IllegalStateException`); `AuthViewModel` logs
`error.message` from Firebase exceptions, which do not contain passwords or tokens.

**Security surface.** `AndroidManifest.xml`: `allowBackup="false"`, no `usesCleartextTraffic` in the
main manifest (defaults false at this target SDK; the debug manifest adds a network security config for
the emulators only), `WorkManagerInitializer` removed in favour of the Hilt-provided configuration, and
the only exported component is the launcher activity. The `FileProvider` is `exported="false"` with
`grantUriPermissions="true"`, and `file_paths.xml` exposes exactly one path:
`<cache-path name="export" path="exports/" />`. `ExportUtils` writes only
`cacheDir/exports/ausgegeben_export.csv` and grants a single read URI per share intent, so the provider
cannot reach the DataStore files, the Firestore cache, shared prefs, or any parent directory. Verified
against `ExportFileProviderTest` (2 instrumentation tests). Permissions are minimal: `INTERNET`,
`ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`. No deep links.

**R8 / release mode.** `assembleProdRelease` succeeded during this audit:
`minifyProdReleaseWithR8`, `lintVitalProdRelease`, `optimizeProdReleaseResources` and
`packageProdRelease` all executed, producing a 6.75 MB APK with full mapping, seeds, usage and
configuration reports. `mapping.txt` contains 2,992 `_Impl`/`RoomDatabase` references, confirming the
Room keep rule in `proguard-rules.pro` is **still load-bearing** (via WorkManager's bundled
`WorkDatabase`) rather than vestigial — do not remove it. The reflective lookups in
`AusgegebenApplication` (`android.os.SystemProperties`, the debug App Check factory) are all inside
`BuildConfig.DEBUG` branches that R8 removes from release, so they need no keep rules.

One note on reliability: my first `assembleProdRelease` invocation failed immediately after
`minifyProdReleaseWithR8` and an identical retry succeeded. I did not capture the first failure's
cause and could not reproduce it, so I am recording it as an unexplained one-off rather than a finding
— but a flaky release build is worth watching, since `release.yml` has no retry.

**Release runtime is not verified locally.** The APK built here is signed with the throwaway local
keystore (see §25) and was not installed or launched. **Release build verified; release runtime not
verified.**

Findings from this section: AUS-011, AUS-012, AUS-020, AUS-021.

---

## 19. Web / PWA Review

**Checked and clean:** `tsc --noEmit` passes with strict settings; `npm run lint:css` validates 457
class tokens against the handwritten utility CSS with no undefined utilities; no
`dangerouslySetInnerHTML` or `innerHTML` anywhere; no user-controlled `href`, no open redirect, no
credential in `localStorage`/`sessionStorage` (Firebase manages its own persistence); CSV download uses
a `Blob` with an immediately revoked object URL.

**Error handling is a strength.** `ErrorBoundary` catches render throws and offers both "reload" and
"reload without cache" (unregistering the service worker and clearing Cache Storage) — the specific
recovery needed when a cached bundle is the thing that is broken. `installGlobalErrorHandlers` covers
what a boundary structurally cannot: event-handler throws and unhandled rejections. Reports buffer
before a sink attaches and replay on attach, so startup crashes are not lost. This is better than most
production React apps.

**Effects and subscriptions.** I looked specifically for the listed hazards. Cleanup functions are
present on the listener effects; `useRecordViewModel` guards its soft-delete set behind a ref to avoid
a stale closure in the toast callbacks; `useInsightsViewModel` swaps between the range listener and the
capped all-time fetch on period change. Zustand selectors are narrow (`(s) => s.currency`) rather than
whole-store subscriptions. I found no listener leak, no duplicate subscription, and no state-update
after unmount pattern.

One thing I set out to report and then closed: `getFirebaseApp()` throws in production when
`VITE_FIREBASE_APP_CHECK_KEY` is missing, which would make the app unusable, and `smoke.mjs` does not
probe for that key. But `vite.config.ts:8-16` **fails the build** when the mode is production, an API
key is configured, and the App Check key is not:

```8:16:web/vite.config.ts
  if (
    mode === 'production' &&
    env.VITE_FIREBASE_API_KEY?.trim() &&
    !env.VITE_FIREBASE_APP_CHECK_KEY?.trim()
  ) {
    throw new Error(
      'VITE_FIREBASE_APP_CHECK_KEY is required for production builds when Firebase is configured.',
    );
  }
```

Since `npm run deploy` and `deploy:hosting` both run `npm run build`, there is no documented path that
produces a deployable bundle missing the key, and the CI build (which has no Firebase secrets, so the
guard correctly skips) is only a compile check. **Not a finding** — the fail-closed guard is in the
right place. Recorded because it is exactly the failure pattern of the dead-API-key incident, and the
guard is the reason it cannot recur.

**PWA and service worker.** `VitePWA` with `registerType: 'autoUpdate'` and `generateSW`; precache is
`**/*.{js,css,html,ico,png,svg,woff2}` — 40 entries, 1,522 KiB. **There is no `runtimeCaching`
configuration at all**, which is the important answer to §26: Firebase Auth and Firestore traffic is
never intercepted or cached by the service worker, so no stale financial data can be served and no
authenticated request can be replayed from cache. `autoUpdate` means a new worker claims clients
immediately rather than waiting for every tab to close, so the window in which an old cached bundle
runs against a new backend is one page load rather than indefinite. Combined with the error boundary's
cache-clearing reload, the answer to "could a newly deployed schema change interact badly with an old
cached bundle?" is: briefly possible, bounded to a single navigation, with a user-accessible recovery.
Given the schema only ever gains optional fields (the rules tolerate legacy shapes by design), the
practical risk is low.

**Security headers** (`firebase.json`) — reviewed for effective values, not mere presence. CSP is
same-origin-first with `frame-ancestors 'none'`; HSTS, `X-Content-Type-Options: nosniff`,
`Referrer-Policy` and a restrictive `Permissions-Policy` are all set. The policy is tight enough that
adding a cross-origin error endpoint requires an explicit `connect-src` entry — and `errorSink.ts:11-12`
documents exactly that, which tells me the CSP is real rather than decorative. `smoke.mjs` asserts the
headers survived deployment, which is the right place to check them.

---

## 20. CSV / Data Portability Review

Both exports produce `date,time,type,category,note,amount` with `yyyy-MM-dd` and `HH:mm` in device
local time, `\n` separators, no BOM, no trailing newline, and identical quoting/escaping semantics.
Deleted rows are excluded on both. Category names resolve through the same unknown-label fallback.
Transfers are exported with `type=transfer` rather than being folded into either direction.

**Formula injection is mitigated on both platforms.** A field beginning with `=`, `+`, `-`, `@`, tab or
CR is prefixed with a single quote before quoting, so `=HYPERLINK("http://evil","click")` in a note
exports as `'=HYPERLINK(...)` and Excel, LibreOffice and Sheets all treat it as text. Verified in
`ExportUtilsTest` and `analytics.test.ts`. Amounts are always positive so the `-` trigger never
produces a spurious prefix on numeric cells.

Divergences: the amount cell (AUS-009), the missing `\r` in web's quoting predicate (AUS-010), and the
absence of a timezone column (AUS-025). Everything else is byte-compatible.

---

## 21. Privacy Review

| Data | Where it lives | Protection |
|---|---|---|
| Email, UID | Firebase Auth | provider-managed |
| Transactions, notes, categories, budget | Firestore under `users/{uid}` | rules; owner-only |
| Firestore offline cache | app-private storage (Android), IndexedDB (web) | Android FBE + `allowBackup="false"`; browser origin isolation |
| Preferences | DataStore (Android) sealed with `PrefsCrypto`; Zustand + Firestore | `PrefsCryptoTest` (3 tests) |
| Exported CSV | `cacheDir/exports/` (Android), user download (web) | FileProvider single-URI grant; cache is app-private |
| Error reports | Cloudflare Worker logs | no identity or financial data — see AUS-016 |

**Android backup cannot copy financial data**: `allowBackup="false"` makes the `dataExtractionRules`
and `fullBackupContent` declarations moot but harmless. Logging was reviewed separately for release:
the `Log.w`/`Log.i` statements carry operation names, document IDs and exception messages — no amounts,
no note text, no category names, no email, no tokens. `AppRepository.kt:727` logs orphan *counts*, not
contents. The App Check debug secret is logged only in debug builds and only behind an opt-in system
property (`AusgegebenApplication.kt:126-157`), which is a thoughtful detail on a shared test device.

**Documentation accuracy.** "No third-party analytics or trackers" is literally true — there is no
analytics SDK, no tracker, no vendor crash reporter. But error reports do leave the device to a
Cloudflare-hosted endpoint with no disclosure and no opt-out, which is AUS-016. That is a
documentation and consent gap, not an implementation vulnerability, and I have kept the two separate.

---

## 22. Performance & Firebase Spark Quota Review

Approximate and labelled as such — derived from query shapes, not measured against a metered project.

| Operation | Reads | Writes | Listener impact | Quota risk |
|---|---:|---:|---|---|
| Android cold start, signed in | 1 marker + N categories + month rows; **first ever start** adds a full-collection dedupe/orphan scan | 0–1 marker | 3 listeners (categories, month, prefs) | one-time scan is the peak |
| Web first load | same shape | same | same | same |
| Month listener steady state | changed documents only | — | 1 | low |
| Add expense | 1 idempotency probe + up to 2 in-rules (`exists`/`get`) + 2 aggregate reads for the budget projection | 1 | — | ~5 reads/save |
| Edit expense | up to 2 in-rules + 2 aggregate | 1 | — | low |
| Delete / undo | 0 | 1 / 0 | — | negligible |
| Duplicate | 1 probe + rules reads | 1 | — | low |
| Category reorder | cached list (0 extra) | N in **one** batch | — | low |
| Category delete | 2 equality queries (string + numeric) over matching rows | N + 1 | — | proportional to category size |
| Orphan repair | all categories + up to 5,000 expenses | N | — | **the single most expensive operation**; gated one-shot |
| All-time analytics / CSV | up to 5,001 | 0 | 1 | capped + 30 s memo + truncation banner |
| Account deletion | full subtree | full subtree | — | one-off |

**The quota discipline here is deliberate and effective:** full scans are behind one-shot markers, the
all-time path is capped at 5,000 with a user-visible truncation notice, the 30 s memo is a rate limit
rather than a staleness policy (and every local write clears it before the change event fires), and
`ExpenseViewModel` shares one month listener across three consumers instead of opening two. There is a
dedicated 13-test `readReduction.test.ts` suite guarding this, which is unusual and good.

**Scalability by account size.** At 10 or 1,000 transactions everything is comfortable. At 10,000 the
month-scoped screens stay cheap (they are range-queried) while all-time analytics and CSV silently
truncate to 5,000 — surfaced by `dataTruncated`, so the user is told rather than misled. The
aggregation-based budget projection is the right shape at any size (roughly 1 read per 1,000 documents
rather than N). The two real scale issues are AUS-013 (the repair window is arbitrary rather than
recent) and the fact that all-time totals become *incomplete-but-labelled* past 5,000 rows, which is a
reasonable trade on Spark. The quota-abuse ceiling is AUS-005/AUS-019, both availability rather than
correctness.

**Caches.** One derived cache exists (the all-time scan memo). Verified: keyed by uid; cleared on
sign-out; cleared by local writes; a failed query is not cached as a valid zero (the repository
distinguishes listener failure from empty via `markListenerFailed`, and the truncation flag comes from
the listener rather than being re-derived from list length, which previously produced a false banner at
exactly the cap). Category changes do not invalidate the expense memo, so a category rename can show a
stale name for up to 30 seconds in a CSV export taken immediately after — within the documented
staleness window and not worth a finding.

---

## 23. Accessibility Review

Inspected in code on both platforms. Not verified with a screen reader or with font scaling on a
device, which is the honest limit of this section.

**Web.** 56 `aria-label` attributes; 31 `aria-live` / `role="status"` / `role="alert"` usages,
including the sync-error and truncation notices, so async state changes are announced rather than
silently rendered; 8 `role="dialog"`/`aria-modal` usages; a shared `useFocusTrap` hook that centralises
Escape handling and focus containment (which is why only three literal `'Escape'` handlers exist — the
dialogs delegate); 56 `aria-hidden` on decorative elements such as the donut dots; 6
`prefers-reduced-motion` blocks in CSS. The 44 px touch floor lives in a `@media (pointer: coarse)`
block as documented in `AGENTS.md` §2, and I did not recommend moving it.

**Android.** 82 `contentDescription` usages; 26 `Modifier.semantics`/`Role.`/`stateDescription`
usages, so controls carry role and state rather than label alone; 9 `clearAndSetSemantics`/`liveRegion`
usages, which is the correct tool for collapsing a composite (the amount display sets a single
description combining the value and the currency symbol at `AddTransactionScreen.kt:791`, rather than
letting TalkBack read the digits as separate nodes); 16 references to 48 dp / minimum interactive
sizing; and **6 instrumentation tests dedicated to touch-target floors** (`TouchTargetTest`), which is
more than most projects automate. Per `AGENTS.md` §2 I evaluated the bare numpad on function, not
appearance: the keys carry semantics and meet the size floor.

**The dialog pattern on web is the strongest part.** `useFocusTrap` (`web/src/hooks/useFocusTrap.ts`)
traps Tab, handles Escape and restores prior focus on unmount, and `ConfirmDialog` uses
`role="alertdialog"` with `aria-modal`, `aria-labelledby` and `aria-describedby`. Form errors on the
add-transaction and auth paths pair `aria-invalid` with `aria-describedby` and a `role="alert"`
message. `BudgetProgressBar` is a real `role="progressbar"` with `aria-valuetext`. `DonutChart` and
`CashFlowChart` both expose computed `aria-label` summaries, and Insights renders the same numbers as
a text list beside the chart. `IosSegmentedControl` is a `radiogroup` with arrow/Home/End keys. There
is a skip link, proper landmarks, `aria-current="page"` on the active tab, and inactive tab panels are
removed from the tree with `display: none` plus `inert`.

**Established gaps.** Two are written up as findings: AUS-027 (Android delete and duplicate are
gesture-only) and AUS-028 (the loading overlay does not contain focus). Beyond those, verified by
reading the implementation:

- **Android chart content descriptions are generic rather than data-bearing** —
  `Charts.kt:515-522` announces "Cash flow chart showing income and expense trends" with no totals,
  where the web equivalent embeds the figures in its `aria-label`. Mitigated on the screens that
  matter by adjacent text (`BillsScreen.kt:464-471, 554-568`), so a TalkBack user does reach the
  numbers — just not from the chart.
- **`CashFlowLegend` on Android is two unlabelled colour dots** (`Charts.kt:599-607`), so income
  versus expense is conveyed by colour alone at that node. The subtitle above carries both formatted
  totals; web's legend includes text labels.
- **Android segmented controls expose `selected` and a label but no `Role.RadioButton`**
  (`IosSurfaces.kt:316-319`), so the type filter and type picker are not presented as a single-choice
  group the way web's `radiogroup` is.
- **Two touch targets fall under their platform floor**: Android numpad keys are `height(46.dp)`
  (`AddTransactionScreen.kt:899-901`) against Material's 48 dp, and the web search clear button is
  40×40 px (`pages.css:1483-1489`) against the project's own 44 px coarse-pointer floor, which does
  not list that selector. Note that the numpad's *bare styling* is deliberate per `AGENTS.md` §2 and I
  am not questioning it — only the 2 dp size shortfall, which is a separate property.
- **`AppTextButton` sets no minimum height** (`AppButtons.kt:76-80`) and is not covered by
  `TouchTargetTest`, which exercises `AppButton`, `AppIconButton` and `AppFab` only.
- **Per-point cash-flow values on web are pointer-only** — the hover tooltip
  (`CashFlowChart.tsx:125-133, 293-309`) is the sole route to a specific month's figures.
- **`scrollIntoView({ behavior: 'smooth' })`** at `AddTransactionView.tsx:77` ignores
  `prefers-reduced-motion`, which the CSS overrides cannot reach.

One claim I investigated and **rejected**: the add-transaction overlay stays mounted while the
Categories sheet is open with only `aria-hidden` set, which looks like a stacked-modal focus leak —
but `.safe-overlay--suspended` applies `visibility: hidden` (`ios.css:147-150`), which does remove
descendants from the tab order. Not a defect.

Colour is used to distinguish income/expense/transfer throughout, consistently mitigated by `+`/`−`
prefixes, text labels and type badges. Contrast is covered by `ThemeContrastTest` (6 tests) across all
ten themes, which is a genuinely good automated check.

**Requires device verification** (cannot be settled by reading): whether TalkBack surfaces the
swipe-to-delete gesture on Compose's `SwipeToDismissBox`; whether Material3 `ModalBottomSheet` traps
focus for the theme and period sheets; and whether the 56 dp save button clips at 200 % font scale.
Use the AVD with a throwaway account.

---

## 24. Dependency / Supply-Chain Review

**Web runtime dependencies are clean.** `npm audit --omit=dev --audit-level=high` reports **0
vulnerabilities**. The five runtime dependencies are `firebase ^12.16.0`, `react`/`react-dom ^19.1.0`,
`zustand ^5.0.5` and `lucide-react ^0.525.0` — a deliberately small surface. Caret ranges are pinned by
`package-lock.json`, and an `overrides` entry pins `brace-expansion` to `5.0.8`.

`npm audit` across all dependencies reports 15 (8 moderate, 7 high), all reached through
`firebase-tools` (`gaxios` → `uuid`). These are **build and deploy tooling, not shipped code**, and the
project's own CI already draws that distinction by auditing production dependencies separately. I am
respecting that distinction rather than reporting them as runtime risk. The one nuance worth stating:
`firebase-tools` is what performs deployments, so tooling compromise is a deploy-path concern even
though it is not a client-runtime concern — these particular advisories are not that.

**Android.** Kotlin/Compose/AGP/Firebase BOM/Hilt/WorkManager/security-crypto, all current enough that
no dangerous incompatibility appeared in the build. The only deprecation warnings in the whole release
build are the two Firestore persistence setters (AUS-020). Java toolchain drift is worth noting as
documentation debt: `README.md:140` says JDK 21, CI uses JDK 17, and the Gradle config targets Java 11
bytecode — all three work, but only by accident of compatibility rather than by statement.

No committed secrets. I searched the tree for private keys, keystores, `.env` files, service-account
JSON and tokens: `keystore.properties` and `ausgegeben-release.jks` exist locally and are both
gitignored; `.env*` is gitignored; `app/google-services.json` carries the public mobile config, which
is not a secret and is not reported as one.

---

## 25. CI / Release Pipeline Review

**CI (`ci.yml`)** is genuinely good. Four parallel jobs (Android unit+lint+assemble, Android
instrumentation on an API 29 emulator, web, rules+repository emulator) plus a combined status. It runs
`assembleProdRelease` when `GOOGLE_SERVICES_JSON` is present, so **R8 is exercised on every push** —
which is the direct mitigation for the historical release-only crash. The web job audits production
dependencies. Secret-dependent steps skip on fork PRs, which is correct behaviour; the coverage lost on
a fork is the release build and the instrumentation run, and that should be understood rather than
fixed.

**Release (`release.yml`)** is where the risk concentrates. Tracing tag → published APK:

| Step | Verdict |
|---|---|
| Checkout at tag / dispatch input | fine; the input is validated before any shell use |
| Secret presence check | good — fails loudly rather than publishing an unsigned or misconfigured build |
| Version derivation | regex-validated; MINOR/PATCH bounded; MAJOR unbounded (AUS-023) |
| `assembleProdRelease` with `-P` overrides | correct |
| `apksigner verify --print-certs` | **proves signed, not signed-by-the-right-key** — AUS-003 |
| Emulator install + launch + 12 s survival | the single best thing in this pipeline |
| `gh release create` | fine |
| Shred keystore | correct, but too late — AUS-004 |
| **Tests** | **none at all** — AUS-002 |

I demonstrated AUS-003 concretely during this audit. The release APK I built locally verifies as
validly signed:

```
Signer #1 certificate DN: CN=Test, OU=Test, O=Test, L=Test, ST=Test, C=US
Signer #1 certificate SHA-256 digest: 5009409a377ff12d1074ae2f19b0599c3f9536771e9efa5087372a8243a8f13b
```

`apksigner verify` exits 0 on that APK. The published v2.0.0 is signed `CN=Ausgegeben, O=shareef01`.
The workflow's check cannot tell those two apart — which is exactly the confusion `AGENTS.md` §3 had to
correct once already. That same build also reported `versionCode='1' versionName='1.0'`, confirming the
`AGENTS.md` §4 gotcha still holds for a `-P`-less local build; CI passes the overrides correctly.

**Command injection** (§51, §75): I looked for it and it is prevented. The only shell interpolations of
attacker-influenced values are the tag/input, and `release.yml:68-71` rejects anything not matching
`^[0-9]+\.[0-9]+\.[0-9]+$` (after stripping `v`) before the first use. Git ref names *can* contain
quotes and semicolons, so the regex is doing real work here — but it does its job, and I am not
reporting an injection that validation prevents.

**Smoke (`smoke.yml` / `smoke.mjs`)** — reviewed rather than executed, to avoid touching production.
What it proves: the page responds, the React mount point is present, the security headers survived
deployment, the JS bundles load, the Firebase Web API key in the shipped bundle is still accepted, the
service worker is cacheable. What it does **not** prove: that sign-in works end to end, that a
Firestore query succeeds, that the deployed rules are the version in the repository, that composite
indexes are `READY`, or that error reporting is configured (AUS-007). It is dependency-free and
non-mutating, which is the right design. The proportionate expansion — and I would not go further than
this — is to fail on a missing error-report URL and, optionally, to assert the deployed rules version
by checking one predictable denial (an unauthenticated read must 403), which needs no credentials.

**Deployment ordering.** `npm run deploy` runs build → `deploy --only hosting,firestore:rules,
firestore:indexes` → smoke, in one command. Rules and indexes therefore deploy alongside the client
rather than ahead of it, and index builds are asynchronous. For an aggregate-query change that means the
client can reach production before its index is `READY`, with the failure silently swallowed by the
best-effort wrappers. `AGENTS.md` §3 already prescribes the correct discipline (`npm run deploy:rules`
first, confirm `READY`, then ship). That discipline is documented but not enforced by tooling; enforcing
it is not worth a code change, but it belongs on the manual checklist in §32.

---

## 26. Historical Failure Regression Matrix

| Historical failure | Current mitigation | Automated? | Can it regress unnoticed? |
|---|---|---|---|
| R8 stripped Room constructors → every release APK crashed | keep rules in `proguard-rules.pro` (verified still load-bearing: 2,992 `_Impl`/`RoomDatabase` entries in `mapping.txt`); CI runs `assembleProdRelease`; CI **and** `release.yml` install and launch the signed APK on an emulator | **Yes** | Unlikely — the launch gate is real |
| One rules-rejected document aborted a 450-doc batch | `reassignExpenses` falls back to per-document writes and counts unfixable rows, on both clients | **Yes** — `batchAtomicity.test.ts` (5) | No |
| Legacy `Timestamp` `updatedAt` froze 44% of rows | `validUpdatedAt()` accepts number **or** timestamp; both clients coerce | **Yes** — rules tests built from real field shapes | Only if the allowlists are tightened without a test |
| Web API key silently deleted → sign-in broken for everyone | `smoke.mjs` probes the key's liveness on every deploy and daily | **Yes** | No |
| Soft-deleted rows inflated totals by €7,655 | every read path filters `deleted`; the aggregate path subtracts the deleted subset | **Yes** — `softDeletedRows.test.ts` (5) | No |
| Category reorder raced / duplicated `sortOrder` | busy-guard + single atomic batch; legacy fields tolerated so the write is not rejected | **Yes** — `CategoryReorderTest` (9), `CategoryViewModelTest` (13), a rules case from the real account's shape | No |
| Month total still counted deleted rows after the first "fix" | see soft-delete row above | **Yes** | No |
| Mass-delete gated on an already-set marker (dead cleanup) | the destructive cleanup was removed; the orphan sweep is re-runnable through the manual dedupe action | Partly | **Yes** — any *new* repair keyed on `orphansScannedAt` would be born dead. Process discipline only. |
| `sum()` failed in production for want of an index including the aggregated field | both aggregation indexes declared with `amount`; the rule is documented at both call sites | **No** — the emulator invents indexes; `gcloud … list` reported `READY` for a different index; both clients swallow the failure | **Yes** — this remains the least-guarded historical failure. Only a real device with a budget set and a clean logcat proves it. |
| "Device-verified as working" claim that was wrong for a real account | rules tests now built from observed production field shapes rather than pristine fixtures | Partly | Yes — AVD data cannot carry a real account's field drift |

Two rows are worth emphasising because they are the residual risk: the **aggregation index** failure is
silent by construction and cannot be caught by any suite in this repository, and the **marker-keyed
repair** trap is prevented only by a maintainer remembering. Both are captured in §32.

---

## 27. Test Coverage / Risk Matrix

Actual counts at HEAD (all executed for this audit except instrumentation): **295 tests** — 129 Android
unit, 9 Android instrumentation, 75 web unit, 38 rules, 44 repository/emulator.

| Risk | Existing test | Quality | Missing scenario |
|---|---|---|---|
| Cross-user access | `firestore.rules.test.ts:126` | **one assertion (read only)** | foreign-UID create/update/delete/list, and all three other subcollections — AUS-026 |
| Unverified-user permissions | rules tests incl. the deletion-marker cases | strong | get/list split if AUS-005 is actioned |
| Legacy document shapes | rules tests built from real field distributions | **strong and unusual** | a merge write to a row carrying all four legacy expense fields at once |
| Soft-deleted rows in totals | `softDeletedRows.test.ts` | strong | — |
| Batch chunk boundaries | `batchAtomicity.test.ts` | strong | chunk N succeeds, N+1 rejected → invariant after partial failure |
| Read-count discipline | `readReduction.test.ts` (13) | strong, rare | — |
| Category reorder concurrency | `CategoryReorderTest` (9) + `CategoryViewModelTest` (13) | strong | two-device simultaneous reorder (needs two clients) |
| Category dedupe | `CategoryDedupeTest`, `pickDedupeMaster.test.ts` | good | — |
| Money rounding | `AmountRoundingTest` (3), `currency.test.ts` (13), `CurrencyUtilsTest` (5) | good per platform | **cross-platform equality** of format/parse/CSV output |
| Period boundaries | `PeriodUtilsTest` (4), `periodUtils.test.ts` (8) | good per platform | **cross-platform equality** at a month boundary |
| Insights totals | `InsightsStateTest` (11) | good | Σ breakdown == total when a category is missing (AUS-006) |
| Budget projection | `ExpenseViewModelTest` fakes `sumMonthExpenses` | weak by necessity | index presence is unprovable locally |
| Reminders | `ReminderSchedulerTest` (5) incl. DST | good | timezone change (AUS-012) |
| Preferences LWW | `PreferencesCloudSyncTest` (17), `preferencesSync.test.ts` (7) | good for parse/clamp, **not for conflict** | the merge rule itself: `updatedAt` appears once in the Android suite, as a fixture literal — no test asserts a newer remote wins over an older local, or the reverse |
| Account deletion | `expenseRepository.test.ts` marker cases | partial | **Android recovery path (AUS-001) — untested because it does not exist** |
| CSV escaping | `ExportUtilsTest` (4), `analytics.test.ts` | good | `\r` case (AUS-010); cross-platform cell equality |
| FileProvider boundary | `ExportFileProviderTest` (2) | good | — |
| Release launch | emulator launch in CI + release | good for crash-on-launch | no signed-in path exercised |
| Touch targets | `TouchTargetTest` (6) | good | — |
| Theme contrast | `ThemeContrastTest` (6) | good | — |

**Fixture realism** (§67) is the question I expected to answer badly and did not. The rules tests are
constructed from field shapes observed on a real long-lived account — the counts in the rules comments
("22 of 89", "12 of 17") come from that exercise — so `deleted: true`, `cloudId`,
`categoryCloudId`, `receiptImagePath: null` and Timestamp `updatedAt` all appear in fixtures rather
than only in pristine current-schema rows.

The gaps that remain are volume (nothing seeds thousands of rows), combination (no single fixture
carries every legacy field at once), and four specific shapes that the audit established exist or are
tolerated in production but that **no fixture ever seeds**:

- **`dateMillis` as a Timestamp.** `validDateMillis()` accepts number or Timestamp, mirroring the
  `updatedAt` drift that once froze 44 % of an account's rows — but every expense fixture writes a
  number, so the tolerated branch is unexercised.
- **The three degenerate expense documents** with no core fields, documented in `AGENTS.md` §2 as
  inert and intentionally retained. Nothing asserts a client reading them stays inert.
- **Categories missing `iconName`, `colorInt` or `sortOrder`.** This is the exact shape behind the
  Android-defaults-vs-web-raw parity gap in §14, and `deduplicateCategories` patches missing
  `sortOrder` at runtime, so the shape is expected — yet no fixture produces it.
- **Duplicate `sortOrder` values in Firestore.** `CategoryReorderTest` covers duplicates in an
  in-memory Kotlin list; no emulator fixture writes two categories sharing a `sortOrder`, which is the
  state the reorder incident actually produced on a real account.

Android also has no repository-level tests at all: soft-delete exclusion, batch chunk fallback and
unverified-write rejection are covered only on the web side (`softDeletedRows.test.ts`,
`batchAtomicity.test.ts`), even though `AppRepository.kt` implements the same invariants
independently. Those are the paths behind AUS-006.

---

## 28. Documentation Accuracy

| Claim | Reality |
|---|---|
| Email/password authentication | ✅ verified, only provider |
| App Check present but unenforced | ✅ verified; web logs a harmless 403 as documented |
| Firebase Spark, no Cloud Functions | ✅ verified; error endpoint is a Cloudflare Worker for this reason |
| GitHub Releases distribution, versionCode from tag | ✅ verified |
| Legacy fields tolerated, never written | ✅ in rules and in Android; web's `updateExpense` spread re-sends tolerated legacy fields it read, which is functionally neutral under `merge` but is technically a re-write |
| Rules gate mutations on verified email | ✅ verified |
| CSP / HSTS / frame-ancestors / Permissions-Policy | ✅ verified with effective values |
| "235 automated tests" | ❌ **295** — AUS-015 |
| Per-suite counts (69 / 116 / 44 / 38 / 8) | ❌ 75 / 129 / 44 / 38 / 9 |
| Smoke test checks page, headers, key liveness | ✅ accurate |
| "No third-party analytics or trackers" | ✅ literally true, but incomplete — AUS-016 |
| JDK 21 prerequisite | ⚠️ CI uses 17; Gradle targets Java 11 bytecode. All work; the docs pick one number |
| `AGENTS.md`: aggregation indexes deployed | ✅ declared in `firestore.indexes.json`; cloud state is **Requires production verification** |
| `AGENTS.md`: local keystore is a throwaway, not the release key | ✅ **independently confirmed** — the APK I built verifies as `CN=Test, OU=Test, O=Test` |
| `AGENTS.md`: `-P`-less release build yields versionCode 1 | ✅ **independently confirmed** — `versionCode='1' versionName='1.0'` |
| `AGENTS.md` / README reference Room | ❌ the app has no Room dependency; the keep rule is load-bearing only via WorkManager |

`AGENTS.md` held up unusually well: everything in it that I could check locally was accurate, including
both of its own self-corrections. The Room framing is the one piece of drift worth fixing, because it
sends a reader looking for a database that does not exist.

---

## 29. Technical Debt

Only concrete items, each tied to a defect it makes harder to prevent.

1. **Duplicated domain logic across two languages, with no shared test vectors.** Totals, period
   boundaries, currency format/parse, CSV cells, reorder and repair are each implemented twice. Three
   of the findings in this report (AUS-008, AUS-009, AUS-010) are drift between the pairs, and each was
   invisible to both suites because each suite asserts only its own platform's behaviour. The
   proportionate fix is not a shared runtime — it is a **shared fixture file** (JSON) of inputs and
   expected outputs, loaded by one Kotlin test and one vitest test. That converts a class of silent
   drift into a failing build.
2. **`SettingsScreen.kt` carries the account-deletion orchestration inline in composable state.** The
   flow (reauth → mark → wipe → delete, with branch-specific messaging) lives in an `onConfirm` lambda
   at `SettingsScreen.kt:464-521`, which is why it has no unit test and why AUS-001's missing recovery
   branch was easy to overlook. Extracting it into a view model with the existing `AccountActions` seam
   would make both the happy path and the interrupted path testable.
3. **The one-shot marker keys are load-bearing but unversioned.** `orphansScannedAt` now means "this
   account has cold-started", not "this account has been repaired". Any future repair reusing it ships
   dead. A marker naming convention (`repairs.<name>V<n>`) removes the trap.
4. **`web/src/repositories/expenseRepository.ts` and `AppRepository.kt` are both large and both mix
   query, migration, validation and cache concerns.** I am not reporting size as a defect; the concrete
   cost is that the `unfixable` count in AUS-006 is discarded one call frame away from where it matters,
   which is the kind of thing that gets lost in a long file.

---

## 29a. Remediation Applied (2026-08-31)

Everything below was implemented and verified after the audit above was written. The
finding bodies are left as they were, as the record of what was found; this section is
authoritative for current state.

| Finding | Change | Verification |
|---|---|---|
| AUS-001 (High) | `clearAccountDeletionPending()` added to `AccountActions`/`AppRepository`; new `AccountDeletionPendingBanner` offering "finish deleting" or "keep account" (clears marker, re-seeds); banner also raised immediately when a wipe succeeds but Auth delete fails. Strings in `en` + `de`. | Compiles, `lintProdDebug` clean, 131 Android unit tests green. Behaviour on a real interrupted deletion **requires device verification**. |
| AUS-002 (Med) | `release.yml` gained three gate jobs (`gate-android`, `gate-web`, `gate-rules`) that the publishing job `needs:`. Runs unit, lint, CSS, build, rules and repository suites before any signing happens. | YAML parses; each command is the same one CI runs and all pass locally. |
| AUS-003 (Med) | Signing certificate fingerprint pinned in `.github/release-cert.sha256`; release compares it against `apksigner` output and refuses to publish on mismatch. Accepts either `keytool` or `apksigner` formatting. | Extraction and comparison logic exercised in bash against real `apksigner` output from the local `CN=Test` APK: 6 cases including keytool-style input, truncated value, wrong key, and not picking up the SHA-1 line. |
| AUS-004 (Med) | `release.jks` is now shredded immediately after signature verification, before the third-party emulator action runs; `reactivecircus/android-emulator-runner` pinned to commit `a421e43` (v2.38.0). | Pin resolved via the GitHub API and confirmed identical to what `v2` points at today, so behaviour is unchanged. |
| AUS-006 (Med, part) | Insights keeps an orphaned expense as a `?` row instead of dropping it, matching the web fallback, so the breakdown reconciles with the headline total. Unfixable counts from `deleteCategory`/`deduplicateCategories` are now logged instead of discarded. **The delete is still allowed to proceed — see the correction in that finding.** | Two Android unit tests, one of which replaced an existing test that asserted the defect as correct behaviour. |
| AUS-007 (Low) | A missing `VITE_ERROR_REPORT_URL` in the production bundle is now a hard smoke failure, not a pass, and the endpoint's origin must also appear in the CSP `connect-src`. Off-production origins still skip. | Ran against production: 11/11 pass, including the new CSP check. Then mutation-tested by making the endpoint unmatchable: reports `9/10, 1 hard failure` and exits 1, where the old code reported 10/10. |
| AUS-009 (Low) | Both clients render CSV amounts with exactly two decimals (`toFixed(2)` / `String.format(Locale.US, "%.2f")`) instead of `String(amount)` / `Double.toString()`. | Matching test vectors asserted on both sides (`5`→`5.00`, `9.5`→`9.50`, `1234.5`→`1234.50`, `999999999`→`999999999.00`). |
| AUS-010 (Low) | Web `csvEscapeField` now quotes a bare `\r`, matching Android. | Three new web assertions including the leading-CR case, which needs both the apostrophe and quotes. |
| AUS-014 (Low) | `export-signing-material.yml` deleted. | Confirmed first that `RECOVERY_PASSPHRASE` is already absent from repository secrets and that zero artifacts remain stored, so nothing else was outstanding. The real certificate fingerprint recorded in that file was preserved into `release-cert.sha256` before deletion. |
| AUS-015 (Low) | README counts corrected to 307 with a per-suite table; the drifting counts in `AGENTS.md` §5 dropped rather than re-stated. | Counts taken from the actual run reported below. |
| AUS-024 (Info) | `versionCode` derivation forces base 10 (`10#`) and rejects codes above 2100000000. | Bash-tested: `v1.010.5` now yields 11005 rather than octal-mangled 10805; `v214749.0.0` is rejected instead of overflowing a signed 32-bit int; the shell-injection tag shape is still rejected by the regex. |
| AUS-026 (Low) | Cross-user isolation matrix: foreign UID denied get/list/update/delete across `expenses`, `categories`, `settings/preferences`, `meta/dedupe` and `meta/accountDeletion`, plus create attempts, an unverified attacker, and a check that a user's own `pendingDeletion` marker grants nothing in another namespace. | 46 rules tests green, then **mutation-tested**: changing `isOwner` to ignore the uid makes all 8 new tests fail, and the rules file restored clean afterwards. |

Also fixed while verifying, and not in the audit above:

**AUS-029 (Low) — a flaky test that the new release gate would have made release-blocking.**
`ExpenseViewModelTest.toolbarFilters_andSearchQuery_updateUiStateProperly` failed in the
full suite and passed in isolation. Cause: `uiState` combines `insightsFlow` and
`dayTotalsFlow`, both ending in `.flowOn(Dispatchers.Default)` — real threads —
and `combine` withholds its first emission until every input has produced one, so
asserting straight after `advanceUntilIdle()` (which only drains the *virtual* scheduler)
raced the thread pool and read the placeholder `initialValue`. It lost that race only
under the load of the whole suite. Fixed by awaiting the first real emission before
asserting. Worth knowing generally: three other view models use the same
`flowOn(Dispatchers.Default)` + `stateIn` shape, so the same latent race exists wherever a
test asserts on `.value` after `advanceUntilIdle()`.

**Verification run (all suites, 2026-08-31):**

| Suite | Before | After |
|---|---:|---:|
| Android unit | 129 | **131** |
| Web unit | 75 | **77** |
| Firestore rules | 38 | **46** |
| Repository (emulator) | 44 | 44 |
| Android instrumentation | 9 | 9 (not re-run — needs a device) |
| **Total** | **295** | **307** |

`lintProdDebug`, `assembleProdDebug`, `tsc --noEmit`, `lint:css` and `vite build` all
clean. `npm run smoke` against production: 11/11.

**Not done, and why:**

- ~~**The certificate fingerprint itself.**~~ **Done (2026-08-31):** read from the
  published v2.0.2 APK (`24539f14…77ee`, DN `CN=Ausgegeben, O=shareef01`) and
  committed to `.github/release-cert.sha256`. The next tag can publish once this
  lands.
- ~~**AUS-005, AUS-008, AUS-016** and the informational items are untouched.~~
  **Done (2026-08-31):** AUS-008 (Android `formatAmount` follows app language, documented in
  `AGENTS.md`), AUS-016 (README disclosure + web Settings opt-out), AUS-005 (Firebase usage alert
  documented in README). Informational items remain open.
- ~~**AUS-027** (Android gesture-only delete/duplicate) not started.~~ **Done (2026-08-31):**
  `CustomAccessibilityAction` on transaction rows for delete and duplicate.
- **The `SettingsScreen` deletion-flow extraction** (debt item 2) was not attempted. It
  would make AUS-001's path unit-testable, but it is a refactor of an irreversible
  destructive flow and did not belong in the same pass as the fix.

| Finding | Change | Verification |
|---|---|---|
| AUS-003 (cert pin value) | `.github/release-cert.sha256` filled from v2.0.2 APK | `apksigner verify` on downloaded release matches committed fingerprint byte-for-byte |
| AUS-011 | `AusgegebenApplication.installAppCheck()` logs and continues on failure in release | Compiles; aligns with unenforced App Check (AGENTS.md §2) |
| AUS-012 | `BootReceiver` also handles `ACTION_TIMEZONE_CHANGED` | Manifest + receiver updated; lint clean |
| AUS-013 | Orphan repair scans newest 5000 by `dateMillis DESC`; `orphanRepairScanTruncated` recorded in `meta/dedupe` when capped | Both repos + `firestore.rules`; rules test extended; 46 rules + 44 emulator tests green |
| AUS-028 | Add Transaction loading state renders inside the trapped dialog | `useFocusTrap` active while loading; tsc clean |
| AUS-008 | Android `formatAmount` uses app language locale (matches web) | `CurrencyUtilsTest` parity table + `AGENTS.md` §2 |
| AUS-016 | README discloses error endpoint payload; web Settings opt-out gates `installConfiguredErrorSink()` | `errorSink.test.ts` opt-out case |
| AUS-027 | Delete/duplicate exposed as `customActions` on transaction row semantics | Compiles; not screen-reader verified |
| AUS-005 | Firebase console daily-read usage alert documented in README | Documentation only |
| AUS-017 | SHA-pin `checkout`/`setup-java`/`setup-node`/`setup-android`; CI emulator matches release pin | Resolved via GitHub API against current major tags |
| AUS-020 | `PersistentCacheSettings` replaces deprecated persistence setters | Compiles |
| AUS-021 | Android `parseAmount` matches web lone-separator / grouping rules | Unit tests for EUR `"12.50"` → 12.5 |
| AUS-022 | Analytics month picker depth unified at 14 | Default + RecordScreen |
| AUS-025 | CSV local-time contract documented in both exporters | Format unchanged |
| Debt 1 | `testdata/money-parity.json` loaded by `MoneyParityTest` and `moneyParity.test.ts` | Android + web unit |
| Debt 2 | `AccountDeletionCoordinator` + 6 unit tests; Settings delegates | Unit-tested, not device-verified |
| Prefs LWW | `prefsLwwAction` extracted and asserted on both clients | 3+3 tests |
| Rules | Merge with all legacy fields; Timestamp `dateMillis` rejected (number-only) | 48 rules tests |

---
| Room docs | AGENTS / CategoryColors no longer imply an app Room database | Docs only |

---

## 30. Prioritized Remediation Plan

### P0 — before the next public release — **all done, one manual step outstanding**

| Priority | Finding | User impact | Effort | Files | Action | Status |
|---|---|---|---|---|---|---|
| P0 | AUS-003 | A wrong signing key publishes an APK that cannot update any install | XS | `.github/workflows/release.yml` | Pin the expected certificate SHA-256 and fail on mismatch | **Done** — mechanism in place; the fingerprint itself must still be committed to `.github/release-cert.sha256`, and releases fail until it is |
| P0 | AUS-002 | A red commit can ship | S | `.github/workflows/release.yml` | Gate on the commit's CI conclusion, or run the fast suites inline | **Done** — three gate jobs run inline |
| P0 | AUS-001 | Account permanently unusable after an interrupted deletion | S | `AccountActions.kt`, `AppRepository.kt`, `SettingsScreen.kt` | Add `clearAccountDeletionPending` + a Settings banner, mirroring web | **Done** — needs device verification |
| P0 | AUS-004 | Signing-key exposure window | XS | `.github/workflows/release.yml` | Shred `release.jks` right after signature verification; SHA-pin the emulator action | **Done** |

### P1 — next release cycle — **all done**

| Priority | Finding | User impact | Effort | Files | Action | Status |
|---|---|---|---|---|---|---|
| P1 | AUS-006 | Category breakdown silently under-reports | S | `InsightsViewModel.kt`, `AppRepository.kt` | Fall back to an "unknown" bucket; log unfixable rows | **Done** — the "refuse the delete" half was withdrawn, see the finding |
| P1 | AUS-014 | Standing exposure of a keystore backup artifact | XS | `.github/workflows/export-signing-material.yml` | Delete the workflow, its artifacts and the `RECOVERY_PASSPHRASE` secret | **Done** — secret and artifacts were already gone; file deleted |
| P1 | AUS-009 + AUS-010 | Exports disagree between clients; a CR can corrupt a row | XS | `ExportUtils.kt`, `analytics.ts` | Format amounts as `%.2f`/`toFixed(2)`; add `\r` to the web quoting test | **Done** |
| P1 | AUS-007 | Crash reporting can go dark while smoke stays green | XS | `web/scripts/smoke.mjs` | Fail when the production bundle has no report URL | **Done** — plus a CSP `connect-src` check |

### P2 — near term — **all done**

| Priority | Finding | User impact | Effort | Files | Action | Status |
|---|---|---|---|---|---|---|
| P2 | AUS-008 | The two clients render money differently | S | `CurrencyUtils.kt` or `currency.ts` | Choose one rule, document it in `AGENTS.md`, align the other client | **Done** — app language |
| P2 | AUS-005 | An unverified account can exhaust the daily read quota | XS–S | Firebase console / `firestore.rules` | Add a usage alert; optionally split `get`/`list` verification | **Done** — documented alert; rules change not taken |
| P2 | AUS-012 | Reminders drift after a timezone change | XS | `AndroidManifest.xml`, `ReminderScheduler.kt` | Add a `TIMEZONE_CHANGED` receiver that re-enqueues | **Done** |
| P2 | AUS-013 | Orphan repair scans an arbitrary window | S | `AppRepository.kt`, `expenseRepository.ts` | Order by `dateMillis DESC`; record truncation in the marker | **Done** |
| P2 | AUS-016 | Undisclosed off-device error reporting | S | `README.md`, `errorSink.ts` | Document the payload; add a local opt-out preference | **Done** |
| P2 | AUS-011 | A release build can crash on launch for a non-load-bearing subsystem | XS | `AusgegebenApplication.kt` | Log and continue in release, matching web | **Done** |

### P3 — hardening

| Priority | Finding | User impact | Effort | Files | Action | Status |
|---|---|---|---|---|---|---|
| P3 | AUS-026 | Thin regression barrier on a Critical property | XS | `firestore.rules.test.ts` | One parameterised loop: foreign UID × collections × operations | **Done** |
| P3 | AUS-027 | Android delete/duplicate unreachable without gestures | S | `RecordScreen.kt` | Add `customActions` semantics; keep the visual design | **Done** |
| P3 | AUS-028 | Loading overlay does not contain focus | XS | `AddTransactionView.tsx` | Render the loading state inside the trapped dialog | **Done** |
| P3 | AUS-015 | Documentation drift | XS | `README.md`, `AGENTS.md` | Drop the per-suite counts or emit them from CI | **Done** — counts refreshed; AGENTS dropped stale annotations |
| P3 | AUS-017 | Supply-chain hygiene | XS | workflows | SHA-pin remaining actions if desired | **Done** — checkout/setup-java/setup-node/setup-android + CI emulator |
| P3 | AUS-018 / AUS-019 | Quota and storage ceilings | XS | Firebase console | Usage alerts; accept and document | **Done** — documented in README |
| P3 | AUS-020 | Deprecated Firestore persistence APIs | XS | `AusgegebenApplication.kt`, `FirestoreClient.kt` | `PersistentCacheSettings` | **Done** |
| P3 | AUS-021 | Android `parseAmount` EUR-dot edge | XS | `CurrencyUtils.kt` | Match web's lone-separator guard | **Done** |
| P3 | AUS-022 | Analytics history depth 12 vs 14 | XS | `PeriodUtils.kt`, `RecordScreen.kt` | Default / Record picker → 14 | **Done** |
| P3 | AUS-025 | CSV exports carry no timezone | XS | export comments / README | Document local-time contract | **Done** — documented, format unchanged |
| P3 | Debt item 1 | Silent cross-client drift | M | `testdata/money-parity.json` | Shared JSON vectors loaded by both suites | **Done** |
| P3 | Debt item 2 | Untestable deletion flow | M | `AccountDeletionCoordinator.kt` | Extract into a testable coordinator | **Done** |
| P3 | Room references in docs | Misleads readers | XS | `AGENTS.md`, `CategoryColors.kt` | Correct — WorkManager Room, not app DB | **Done** |

---

## 31. Recommended New Tests

1. **`InsightsStateTest`** — given one expense whose `categoryId` is absent from `categories`, assert
   `expensesByCategory.values.sum() == totalExpenses` (fails today; guards AUS-006).
2. **Emulator repository test** — seed a category with one valid and one rules-invalid expense, call
   `deleteCategory`, assert the category still exists and the unfixable count is reported.
3. **Shared cross-platform fixture** — a JSON list of `(amount, currency, language)` → expected
   formatted string, expected parsed value, and expected CSV cell; loaded by one Kotlin test and one
   vitest test (guards AUS-008, AUS-009).
4. **Shared month-boundary fixture** — `(dateMillis, timezone)` → expected period key, asserted by both
   platforms.
5. **`analytics.test.ts`** — `csvEscapeField('a\rb')` must return a quoted field (guards AUS-010).
6. **Android account-lifecycle test** — with `isAccountDeletionPending() == true`, the Settings state
   exposes a recovery action; invoking it clears the marker and calls `ensureSeeded` (guards AUS-001).
7. **`ReminderSchedulerTest`** — the computed delay for a fixed configured hour changes after the
   default `TimeZone` changes, and the receiver path re-enqueues (guards AUS-012).
8. **Rules test** — a merge write to an expense carrying `cloudId`, `categoryCloudId`,
   `receiptImagePath: null` **and** a Timestamp `updatedAt` simultaneously succeeds.
9. **Rules test, cross-user matrix** — for each of `expenses`, `categories`, `settings/preferences`
   and `meta`, a foreign authenticated user is denied `get`, `list`, `create`, `update` and `delete`
   (guards AUS-026; roughly 20 assertions in one loop).
10. **Rules test, `dateMillis` as Timestamp** — an expense whose `dateMillis` is a `Timestamp` is
    accepted on create and on merge update, and a client reading it does not crash. This is the exact
    drift class that froze 44 % of an account's rows via `updatedAt`, and it is currently tolerated by
    the rules but seeded by nothing.
11. **Rules/emulator test, incomplete category** — a category missing `iconName`/`colorInt`/`sortOrder`
    round-trips through both clients without a crash or a blank tile (guards the §14 parity gap).
12. **Emulator test, duplicate `sortOrder` in Firestore** — seed two categories sharing a `sortOrder`,
    reorder, assert the result is a contiguous unique sequence. Today this is only covered in an
    in-memory Kotlin list, not in the store where the real incident occurred.
13. **`PreferencesCloudSyncTest` / `preferencesSync.test.ts`** — assert the LWW rule itself: a remote
    payload with a newer `updatedAt` replaces local, an older one does not, and equal timestamps are
    stable. Currently `updatedAt` appears in the Android suite only as a fixture literal.
14. **Android repository tests** — port the web emulator suite's three core invariants to
    `AppRepository`: soft-deleted rows are excluded from totals, a rejected batch chunk does not strand
    the healthy ones, and an unverified user's write is refused. Android currently has no
    repository-level coverage despite implementing these independently.
9. **Batch partial-failure test** — chunk N commits and chunk N+1 is rejected; assert the documented
   invariant about the resulting state.
10. **Release-workflow assertion** — a shell-level test (or a documented dry run) that the certificate
    fingerprint comparison rejects the local throwaway keystore (guards AUS-003).

---

## 32. Manual Production Verification Checklist

Only items that cannot be safely automated locally. **Use a throwaway Firebase account throughout.
Never inspect the maintainer's real financial account, and never drive the physical phone
(`AGENTS.md` §4).**

**Release APK**
- [ ] Confirm the published APK's certificate DN and SHA-256 match the expected production key
      (`apksigner verify --print-certs` on the downloaded release, compared against the value you pin
      for AUS-003). Do this once now to establish the baseline fingerprint.
- [ ] Install the signed release over an existing install on an AVD and confirm the update succeeds
      (not a fresh install — the update path is what signature mismatch breaks).
- [ ] Confirm `adb shell dumpsys package com.aus.ausgegeben | grep versionCode` matches the tag.
- [ ] Sign in on the AVD with a throwaway verified account and exercise: add expense, edit, delete +
      undo, duplicate, category create/rename/reorder/delete, CSV export, sign out, sign back in.
      **No signed-in path has been exercised on a release build in this audit.**

**Firebase production indexes** — the least-guarded historical failure
- [ ] `gcloud firestore indexes composite list` and confirm **both** aggregation indexes exist and are
      `READY`, checking the field lists include `amount` — not merely that some index is `READY`.
- [ ] On a device with a throwaway account, set a monthly budget, add an expense that exceeds it, and
      confirm the warning appears **and** that logcat / the browser console contains no
      `budget check failed` line. This is the only check that actually proves the aggregation works.

**Production smoke**
- [ ] Run `npm run smoke` after any deploy and confirm the error-endpoint check reports *configured*,
      not *skipped*.
- [ ] Confirm the deployed rules match the repository: sign out and attempt an unauthenticated read of
      any `users/*` path; it must be denied.

**Legacy data (read-only, throwaway account not applicable)**
- [ ] To close the `categoryId` type question in §13, have the maintainer read a small sample of their
      own documents and report only `typeof categoryId` — no amounts, no notes, no category names.

**Deployment ordering**
- [ ] For any future change to an aggregate query: `npm run deploy:rules` first, confirm `READY`, then
      deploy hosting and ship the Android client.

---

## 33. Final Verdict

**READY WITH CONDITIONS.**

The application itself is production-ready. The security boundary is in the right place and holds: I
could not construct any path by which one user reaches another's financial data, in either direction.
Money is represented and aggregated correctly, soft-deleted rows are excluded consistently across
every path I could find — including the aggregate one that was half-fixed historically — and the
legacy-compatibility work is derived from real observed data rather than assumption. The batch→
per-document fallback means a single poison document can no longer strand a healthy batch, which was
this project's most damaging recurring failure. 295 tests pass, including 82 against a real Firestore
emulator, and the release artifact is actually launched rather than merely built.

The conditions are all on the edges rather than in the core, and three of the four P0 items are
single-file changes to one workflow:

1. Pin the expected signing certificate (AUS-003) — the cheapest fix with the worst failure mode.
2. Make the release gate on CI (AUS-002).
3. Give Android the account-deletion recovery that web already has (AUS-001).
4. Close the keystore-exposure window in the release job (AUS-004).

With those four done I would call this **PRODUCTION READY**. Without them, the risk is not that the app
misbehaves for users — it is that the release process can ship something unshippable, and that one
unlucky user can be left with an account they cannot use and no way to fix it.

Two things this audit could **not** establish, and which no amount of local testing can: that the
production aggregation indexes are serving (the emulator invents indexes, `gcloud` reported `READY` for
the wrong index once, and both clients swallow the failure), and that a release build works when
signed in (the APK built here carries a throwaway certificate and was never launched). Both are in
§32. Consistent with this repository's own hard-won lesson: green CI, including everything green in
this audit, does not by itself predict production correctness.
