# Maintaining Ausgegeben

This document records constraints and operational details that are easy to miss when changing Ausgegeben. It complements the setup guides; it is not a substitute for verifying the real release artifact against the real backend.

## Architecture constraints

### Firebase Spark plan

The project intentionally stays on Firebase's no-billing Spark plan. There are no Cloud Functions. The web error endpoint is a Cloudflare Worker in `tools/error-endpoint/` because deploying functions would require the Blaze plan.

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
- Category deletion and deduplication first set `deletionState: deleting`. Rules then reject new references. A transient or unknown reassignment failure preserves and reopens the source category; a confirmed rules rejection may retry individual documents. Any surviving reference prevents deletion.
- Account deletion writes `meta/accountDeletion`, removes cloud documents, and only then deletes the Firebase Auth user. Settings or metadata deletion failures must stop the Auth deletion. The marker remains if the final Auth step fails so the empty account cannot be silently reseeded; retrying account deletion is the recovery path.
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
2. Run `npm run deploy` from `web/`. Its order is deliberate: validate configuration, build, verify the bundle, deploy Hosting plus rules and indexes, then smoke-test production.
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
- Firestore data deletion and Firebase Auth deletion cannot be globally atomic without a trusted backend. The persistent deletion marker makes partial failure explicit and recoverable.
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
