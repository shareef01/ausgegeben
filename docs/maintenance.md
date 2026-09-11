# Maintaining Ausgegeben

This document records constraints and operational details that are easy to miss when changing Ausgegeben. It complements the setup guides; it is not a substitute for verifying the real release artifact against the real backend.

## Architecture constraints

### Firebase billing and quota

Production remains on the Firebase Spark plan. Account deletion is a resumable,
rules-constrained client protocol; the web error
endpoint remains a Cloudflare Worker so telemetry does not add function invocations or
Firebase storage.

Firestore reads are limited, so full-collection maintenance scans use versioned one-time markers under `users/{uid}/meta/dedupe` and the all-time expense fetch has a short cache. Local writes invalidate that cache immediately.

### App Check

Both clients initialize App Check, but enforcement is intentionally disabled for the Firebase project. Android is distributed as a sideloaded GitHub APK, which Play Integrity cannot reliably attest. App Check enforcement is configured per Firebase service rather than per client platform, so enabling it would also block supported clients. Firestore authentication, per-user ownership checks, and field validation are the security boundary.

The web client still requires a reCAPTCHA Enterprise site key in production. An unenforced App Check token request can log a harmless 403; that is not an authorization failure from Firestore.

### Android distribution

Android releases are published through GitHub Releases, not Google Play. Pushing a semantic version tag such as `v2.0.5` starts `.github/workflows/release.yml`. The workflow derives `versionCode` from the tag (`v1.2.3` becomes `10203`), runs the test gates, signs the APK, checks the signing certificate, launches the signed release on an emulator, and publishes it.

`.github/release-cert.sha256` pins the public release certificate. Its current fingerprint is:

```text
24539f14a0e1462546df65bf8edaaeedadbed7cf7bb9b4c258c5463d9aed77ee
```

Local signing material on the maintainer workstation uses a throwaway `CN=Test` certificate. It is useful for R8 and packaging coverage only. A local APK cannot update a published install and must not be distributed. A plain local `assembleProdRelease` also defaults to `versionCode` 1 unless the version properties are supplied.

## Data compatibility and integrity

### Legacy Firestore documents

Security rules tolerate legacy fields but current clients do not write them:

- Expenses may contain `cloudId`, `categoryCloudId`, `receiptImagePath`, and `deleted`.
- Categories may contain `cloudId` and `deleted`.
- `updatedAt` may be either a number or a Firestore `Timestamp` on both document types.

These fields remain type- and size-bounded. Firestore evaluates `hasOnly()` against the merged document, so removing legacy keys from the allowlist would make old rows permanently unwritable. Some historical expense documents have no core fields; clients treat them as inert rather than deleting them automatically.

### Financial and category invariants

- Soft-deleted expenses are excluded from totals but remain references while they can be restored.
- Modern idempotent expense creation uses the lowercase SHA-256 digest of the exact UTF-8 idempotency key as the document ID and creates it transactionally. The legacy field query must remain first so upgrades find older random-ID rows.
- Before a new-expense write, Android seals a payload fingerprint and idempotency key in DataStore; web stores the same opaque pair in IndexedDB. An ambiguous retry within 24 hours reuses the key even after process/tab loss. The acknowledged generation is cleared conditionally so a concurrent newer submission is not erased.
- Category type changes use `migrationState: migrating` plus `pendingTransactionType`. Rules accept linked expenses with either the published or pending type, reject direct category type flips, and permit finalization only to the staged target. Both clients resume staged migrations during seeding; Android serializes staging/finalization in Firestore transactions.
- Category deletion and deduplication first set `deletionState: deleting`. Rules then reject new references. A transient or unknown reassignment failure preserves and reopens the source category; a confirmed rules rejection may retry individual documents. Any surviving reference prevents deletion.
- Orphan repair scans document-ID-ordered pages and checkpoints `orphanRepairCursorId` after each successful page. It writes `orphanScanVersion` only at the terminal page; transient/quota failures therefore resume, while permanently rules-rejected legacy rows finish as `orphanRepairState: complete_with_errors` with an explicit count.
- Preference writes are read/write Firestore transactions on both clients. Rules require `updatedAt` to increase strictly and reject clocks more than five minutes ahead; equal timestamps are first-writer-wins. Local edits use `max(wallClock, previous + 1)`, so clock rollback cannot generate a stale local revision.
- Web sign-out broadcasts cache termination to other open app tabs and retries IndexedDB clearing; Android propagates `clearPersistence` failure. Neither client reports a local-cache failure as a failed cloud/Auth deletion. The UI instead warns that local financial data may remain and directs the user to close tabs/clear site data or clear Android app storage. Firebase cache deletion is not a secure-overwrite guarantee.
- `app/google-services.ci.json` targets a deliberately nonexistent project and contains no credentials with backend access. Fork CI copies it when secrets are unavailable so R8 and device instrumentation still run. Skipped required jobs make the combined status fail, and release tags rerun instrumentation for the exact tagged SHA.
- Account deletion reauthenticates and force-refreshes the ID token. Rules require a five-minute `auth_time` before accepting `meta/accountDeletion`; the permanent marker freezes writes across clients. Android and web use server-only reads, delete all known collections in unbounded 400-document pages, verify empty, and only then delete Auth. An interrupted or quota-limited attempt resumes after reauthentication; clients cannot clear the marker.
- `sumMonthExpenses` needs composite indexes that include the aggregated `amount` field. Keep both `(transactionType, dateMillis, amount)` and `(transactionType, deleted, dateMillis, amount)` in `firestore.indexes.json`.
- Android suspend operations returning `Result` use `runSuspendCatching`; ordinary `runCatching` must not swallow `CancellationException`.

### Display and UI contracts

- Money display follows the selected app language. Currency controls the decimal separator used for amount input.
- The web `.btn` class deliberately has no padding. Call sites size buttons, and the 44 px coarse-pointer minimum belongs in the media query in `ios.css`.
- Android numeric keypad keys are intentionally unfilled and unbordered.

## Production verification

Passing unit tests or compiling a debug build is not release evidence. Several past failures only appeared with R8, production indexes, legacy document shapes, or the deployed Firebase configuration.

Before an Android release:

1. Run Android unit tests, lint, and `assembleProdDebug`.
2. Run `assembleProdRelease` with real Firebase configuration and the intended version properties so R8 and resource shrinking execute.
3. Verify the APK certificate against `.github/release-cert.sha256`; signature validity alone does not prove the correct key was used.
4. Install and launch the signed CI artifact on an emulator or test device.
5. With a throwaway verified account, add an expense while a budget is set and check logcat for `budget check failed`. The emulator creates indexes on demand and cannot prove production aggregate indexes are serving.

Before or after a web deployment:

1. Keep all production values in the gitignored `web/.env.production`: Firebase API key, auth domain, project ID, app ID, App Check site key, and error-report URL.
2. Deploy and verify Firestore rules/indexes before the clients, then run `npm run deploy` from `web/`.
3. Run `npm run smoke` separately when checking the existing deployment. It verifies the live site, security headers, bundle, Firebase key, App Check key, service worker, and error endpoint without signing in.
4. Exercise signed-in production behavior with a throwaway verified account after backend-sensitive changes.

Do not deploy Firestore rules without their indexes. The local emulator serves undeclared indexes, and clients treat the budget projection as best-effort, so a missing production index can otherwise fail silently.

## Development and test environment

- Android and Firebase emulator work requires a working JDK 21 locally. On Windows, Android Studio's bundled JBR may be broken even when its path exists; confirm with `java -version`. A known working alternative is Microsoft JDK 21.
- If Gradle or the Firestore emulator reports `Unable to establish loopback connection`, use a short writable directory for both `java.io.tmpdir` and `jdk.net.unixdomain.tmpdir` through `JAVA_TOOL_OPTIONS`.
- Git Bash rewrites Android device paths unless `MSYS_NO_PATHCONV=1` is set. Do not pipe binary `adb exec-out` output through PowerShell redirection; capture on-device and pull it, or use the Node screenshot script.
- The Firestore emulator REST API returns 403 without `Authorization: Bearer owner`. A parsed response with no `documents` after that error is not an empty database.
- Firestore writes require a verified email. Emulator accounts must also be marked verified.
- Web emulator mode is `npm run dev -- --mode emulator`. Android debug builds use emulators when `debug.ausgegeben.fb_emulators` is set to `1` before the app starts.
- Pin `ANDROID_SERIAL` to an AVD before any `connected*` task. Gradle otherwise runs against every attached device and may uninstall an existing app to resolve a signature conflict.
- Screenshot automation must use an AVD and the seeded demo account. Never capture a personal device containing real financial data.
- Compose instrumentation requires an unlocked display. A device behind secure keyguard can report `No compose hierarchies found` even when the app itself launches.
- Keep `kotlinx-coroutines-test` in `debugImplementation`. Android instrumentation uses separate app and test APKs; packaging the service provider only in the test APK causes a `ServiceLoader` failure before Compose assertions run.

## Known limitations

- An old released client still uses query-then-random-ID creation and can race a current client during the legacy lookup window. Current-to-current keyed creation is protected by document identity.
- A category can remain marked `deleting` if the process terminates mid-operation. Retrying deletion resumes the operation.
- Firestore data deletion and Firebase Auth deletion are not globally atomic. The persistent tombstone makes the Spark-compatible operation resumable and freezes clients; Auth is deleted only after every known collection is verified empty. The tombstone intentionally remains to block already-issued tokens. Because there is no Admin backend, deletion covers the schema explicitly allowed by rules rather than dynamically discovering arbitrary subcollections.
- The web production environment file is local, gitignored operational state. It must be backed up securely outside the repository or reconstructed from Firebase and App Check settings.

## Useful commands

```bash
# Web
cd web
npm test
npm run lint
npm run lint:css
npm run build
npm run test:rules
npm run test:emulator
npm run smoke

# Android, from the repository root
./gradlew testProdDebugUnitTest lintProdDebug assembleProdDebug
./gradlew connectedProdDebugAndroidTest
./gradlew assembleProdRelease
```
