# Ausgegeben — Firebase Spark compliance review (2026-11-23)

**Base:** `f34e2ad` · **Project:** `ausgegeben01` · **Plan constraint:** Firebase Spark only.
No billing change, deployment, or remote configuration change was made in this pass.

---

## 1. Firebase products actually in use

Verified by reading every SDK import and the Gradle dependency aliases, not by trusting the
README table.

| Product | Web | Android | Purpose |
|---|---|---|---|
| Firebase Authentication | `firebase/auth` | `firebase-auth` | Email/password sign-in, verification, password reset, account deletion |
| Cloud Firestore | `firebase/firestore` | `firebase-firestore` | One standard database, per-user document tree |
| Firebase App Check | `firebase/app-check` (`ReCaptchaEnterpriseProvider`) | `firebase-appcheck-playintegrity` (release), `firebase-appcheck-debug` (debug) | Abuse control; enforcement is off unless configured |
| Firebase Hosting | `firebase.json` site `aus01` | — | Static PWA, SPA rewrite, security headers |
| Firebase Installations / Core | transitive through the SDKs | transitive | SDK plumbing, not a product decision |

Searches returning **no** matches:

```
web/src, web/package.json, web/vite.config.ts:
  firebase/functions, firebase/storage, firebase/messaging, firebase/analytics,
  getStorage, getFunctions, httpsCallable           -> none

app/build.gradle.kts, gradle/libs.versions.toml:
  firebase-functions, firebase-storage, cloudfunctions -> none
```

`firebase.json` declares only `firestore` and `hosting`; there is **no** `functions` deploy
target. A local, git-untracked `functions/` directory exists on this workstation with no
package manifest or tracked source; it is not part of the repository and cannot be deployed
by the configured targets. It should not be committed.

**Verdict:** Spark-compatible. No Cloud Functions, Storage, Cloud Run, Extensions, phone/SMS
auth, TTL, PITR, managed backups, or scheduled jobs.

---

## 2. Firestore read/write profile (by workflow)

These are code-derived estimates (documents touched), not billing telemetry. Firestore
listeners bill the initial result and each changed document; local cache hits are not
server reads. Spark's free daily quota is 50,000 reads / 20,000 writes / 20,000 deletes and
1 GiB stored.

| Workflow | Reads (approx.) | Writes (approx.) | Notes |
|---|---|---|---|
| Sign-in / cold start | 1 `meta/dedupe` + one categories snapshot (`N` docs) + current-month expenses (`M` docs) | 0 | `ensureSeeded` is single-flight per uid; dedupe/orphan sweeps are version-gated one-time passes. `onSnapshot(includeMetadataChanges)` is used, so one read per doc initially. |
| Open Record (this month) | categories `N` + month rows `M` | 0 | One live listener per range; day totals derive from the same rows. No per-filter queries. |
| Save an expense | 1 transaction read on the deterministic doc; optional legacy-key query (`limit 1`); budget projection 2 aggregates (billed ≈1 read per 1,000 docs, minimum 1) + 1 direct read for the edited row | 1 write | Online path uses a transaction for create-if-absent. Offline path queues one write. |
| Edit an expense | 1 stored-doc read + 1 write | 1 | Only changed fields are written (`expenseUpdatePatch`), so one user edit does not rewrite a whole row. |
| Delete an expense | 1 read (cache/server) + 1 delete | 1 delete | Undo is client-side until the toast expires. |
| Insights (month) | categories + current month + prior-month range (two listeners) | 0 | Reuses the same live-range primitive; no full-collection listener. |
| Insights (all time) | one capped 5,000-row server fetch | 0 | Shared across concurrent callers and cached for 30 s; any local write invalidates it. Truncation is surfaced in the UI. |
| CSV / JSON export | paginated server reads (1,000/page) + categories + budgets + recurring + receipts | 0 | Backups intentionally require server-complete data. |
| Restore / replace | pre-flight reads + batched expense writes with a restore journal/lease | batched writes | Safety snapshot first; bounded batch access documented in `docs/maintenance.md`. |
| Account deletion | server-only per-collection reads in 400-doc pages, then deletes | deletes | Tombstone freezes writes first; Auth deletion only after verification. |
| Recurring catch-up | receipts/templates + occurrence writes | ≤ one expense + one receipt per due occurrence | Receipt identity is canonical (`templateId_date`), so retries and concurrent clients are idempotent. |

Inefficiency controls already in place and re-verified:

- no unbounded listener; Record/Insights use date ranges and the all-time path is capped;
- rule-gated aggregate indexes include `amount` for `sum()` (`firestore.indexes.json`);
- the expense `note` field is exempt from indexing because no query filters or sorts on it;
- duplicate scans are guarded by versioned markers and single-flight caches;
- category reorders update only the rows whose position changed;
- retries are bounded and journal-based rather than re-running whole-collection repairs.

**Quota risk:** a single heavy day of browsing plus an all-time scan can approach ~5,000
reads, but only once per 30 s and only when the user opens all-time Insights; ordinary daily
use is far inside the free tier. Backups and restores are the largest deliberate bursts, and
both are user-initiated and bounded.

---

## 3. Security rules and index alignment

`firestore.rules` (699 lines) was tested with the emulator, not reviewed only:

```
cd web && npm run test:rules      -> 4 files / 146 tests passed
cd web && npm run test:emulator   -> 21 files / 190 tests passed
```

The rule suite exercises:

- unauthenticated reads/writes and cross-user document access;
- forged `ownerUid` / ownership fields, invalid field types, oversized fields, malformed
  documents, legacy shapes;
- amount cent-granularity and range bounds, date bounds, note/category length bounds;
- verified-email gating for preferences/transactions/categories, with local-only onboarding
  before verification;
- the account-deletion tombstone: recent `auth_time`, permanent write freeze, no client
  delete;
- category migration barriers and stale-client writes during migration (AUS-101);
- budget documents: expense category, migration/deletion barriers, revision monotonicity;
- recurring templates/counters, immutable occurrence receipts, rules refusing receipt
  rewrites;
- restore journal phases, lease fencing, snapshot chunk IDs and ownership, adversarial
  concurrent restores;
- last-writer-wins ordering, including equal-`updatedAt` commits.

Indexes: `firestore.indexes.json` keeps both `(transactionType, dateMillis, amount)` and
`(transactionType, deleted, dateMillis, amount)` because `sumMonthExpenses` aggregates
`amount`; the `(idempotencyKey, dateMillis)` index supports the legacy-key lookup; note is
explicitly exempt. No index was added or removed in this pass, and the rules tests pass with
the declared indexes on the emulator.

**Known rule limits (documented, not defects):** rules cannot scan a collection, so
finalization of a category migration and receipt-only writes trust the owner's client. Both
affect only that owner's own data and are recorded in `docs/maintenance.md`.

---

## 4. App Check

| Client | Provider | Enforcement | Behaviour verified |
|---|---|---|---|
| Android release | Play Integrity | `ausgegeben.appCheckEnforced` (default **false**) | Provider installed at app start; failures log and do not crash. While unenforced, `TimeBoundAppCheckProvider` caps a slow attestation at 3 s and backoffs for 5 min; when enforced it waits for a real token. Debug uses the debug provider via reflection. |
| Android debug | Debug provider | — | Token is only logged when `debug.ausgegeben.log_appcheck_secret=1` is explicitly set. |
| Web production | reCAPTCHA Enterprise | Console-side; client initialises App Check whenever `VITE_FIREBASE_APP_CHECK_KEY` is set | Production build fails closed if Firebase is configured without the key. Non-fatal 403s from an unenforced token exchange are expected. |

Documentation consistency (`FIREBASE_SETUP.md` vs `docs/maintenance.md`): both state that
Play Integrity supports GitHub-distributed APKs, that Play Console is only needed to link
the API, that the release certificate SHA-256 must be registered, that the "exclusively
outside Google Play" profile must not require `PLAY_RECOGNIZED`, and that the default
one-hour token TTL should be kept. No contradiction found.

Enforcement rollout is still monitor-first and requires an owner decision; nothing was
enabled. Authentication App Check remains off because it needs the Identity Platform
upgrade and its Spark DAU limit.

App Check is **not** treated as authorization: Firestore ownership and schema rules remain
the boundary, as the rule tests demonstrate.

---

## 5. Hosting, headers, and the optional Worker

- Hosting serves `web/dist` with an SPA rewrite, CSP, HSTS, `nosniff`, `DENY` framing,
  strict-origin referrer policy, restrictive Permissions-Policy, and no-cache for
  `index.html`, `sw.js`, `registerSW.js` and `workbox-*.js`. Hashed assets are immutable.
- The CSP allowlists only Google/Firebase/Google reCAPTCHA origins plus the optional
  Cloudflare Worker error endpoint. No wildcard script origin, no `unsafe-inline` style
  (the old inline cold-start style block was removed).
- The optional error endpoint stays a Cloudflare Worker (`tools/error-endpoint`), keeps
  telemetry out of the Firebase billing/storage domain, and is delivered with an App Check
  token. Delivery failures are swallowed.
- `firebase.json` has no Functions, Storage, or Extensions configuration.

---

## 6. Conclusion

The project is Spark-compatible and was not changed in any way that affects billing. The
Firestore model remains listen-light, index-aligned and rules-tested. The only infrastructure
note is the stray, untracked local `functions/` directory, which is not deployable through
the configured targets and should not be committed.
