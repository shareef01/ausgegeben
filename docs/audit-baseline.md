# Audit baseline (2026-08-02)

State of every gate before deeper audit work, all green:

## Web (`web/`, JDK 21 = Android Studio JBR)

| Gate | Result |
|---|---|
| `npm test` (vitest unit) | 62 passed |
| `npm run lint` (tsc --noEmit) | clean |
| `npm run lint:css` | OK — 454 class tokens, no undefined utilities |
| `npm run build` (vite + PWA generateSW) | built, 40 precache entries; non-blocking warning: firebase chunk 660 kB (>500 kB) |
| rules suite (vitest.rules.config.ts, Firestore emulator) | 35 passed |
| emulator suite (vitest.emulator.config.ts) | 39 passed |

## Android (`./gradlew`, JAVA_HOME = Android Studio JBR)

| Gate | Result |
|---|---|
| `./gradlew test` (all unit test tasks) | BUILD SUCCESSFUL — 78 tests, 0 failures/errors |
| `lintProdDebug` | BUILD SUCCESSFUL — 2 warnings: `POST_NOTIFICATIONS` InlinedApi (`MainActivity.kt:133`, no API-33 guard visible), `OldTargetApi` targetSdk 36 < compileSdk 37 |
| `assembleProdDebug` / `assembleProdRelease` (R8) | BUILD SUCCESSFUL — release APK `versionCode=10203`, `versionName=1.2.3` (aapt2 badging) |

## Dependencies

- Web production deps: `npm audit --omit=dev` → **0 vulnerabilities**.
- Web full audit: 7 moderate, all dev-only (firebase-tools transitive: `@google-cloud/pubsub` → `@opentelemetry/core`; `gaxios` → `uuid`). Not shipped; fixing means a breaking firebase-tools change.
- `brace-expansion` override → still justified (minimatch 3.x transitive would pull 1.x with ReDoS advisory).
- Android runtime classpath: clean (Firebase BoM, Compose 1.8.2, Hilt 2.59.2, WorkManager 2.10.1, Kotlin 2.2.20).

## Environment notes

- A leftover dev Firestore+Auth emulator (`demo-ausgegeben`, `--single_project_mode`) was squatting on ports 8080/9099/4400 and blocked the emulator-backed test suites; it was stopped and suites now spawn their own emulator. Restarted on demand for the functional audit.
- Tests requiring the emulator were invoked as `npx vitest run --config vitest.{rules,emulator}.config.ts` against a persistent `firebase emulators:start --only firestore` instance.
