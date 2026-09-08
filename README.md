# Ausgegeben

Ausgegeben is a personal finance tracker for Android and the web. It records expenses, income, and transfers, shows budgets and spending insights, and synchronizes data through Firebase.

[Open the web app](https://aus01.web.app) · [Download the latest Android APK](https://github.com/shareef01/ausgegeben/releases/latest)

[![CI](https://github.com/shareef01/ausgegeben/actions/workflows/ci.yml/badge.svg)](https://github.com/shareef01/ausgegeben/actions/workflows/ci.yml)

## Screenshots

### Web

<p>
  <img src="docs/screenshots/web/web-record-light.png" alt="Web record screen in the light theme" width="49%">
  <img src="docs/screenshots/web/web-insights-dark.png" alt="Web insights screen in the dark theme" width="49%">
</p>

### Android

<p>
  <img src="docs/screenshots/android/record-light.png" alt="Android record screen" width="30%">
  <img src="docs/screenshots/android/insights-light.png" alt="Android insights screen" width="30%">
  <img src="docs/screenshots/android/settings-light.png" alt="Android settings screen" width="30%">
</p>

The screenshots use a local Firebase emulator and seeded demonstration data. The capture scripts are in [`web/scripts`](web/scripts/capture-screenshots.mjs) and [`scripts`](scripts/capture-android-screenshots.mjs).

## Features

- Expenses, income, and transfers with notes and custom categories
- Monthly budgets, category breakdowns, and cash-flow trends
- Search, duplicate, undo-delete, and CSV export
- English and German interfaces with configurable currencies
- System, light, dark, AMOLED, and additional color themes
- Firebase synchronization and offline Firestore caches on both clients
- Configurable daily reminders on Android
- Installable web app with an automatically updated offline shell

## Platforms

| Platform | Stack | Distribution |
|---|---|---|
| Android | Kotlin, Jetpack Compose, Hilt, WorkManager, DataStore | Signed APKs from [GitHub Releases](https://github.com/shareef01/ausgegeben/releases) |
| Web | React, TypeScript, Vite, Zustand | Firebase Hosting at [aus01.web.app](https://aus01.web.app), installable as a PWA |

Both clients use Firebase Authentication with email and password. Transactions, categories, and synchronized preferences are stored below the signed-in user's Firestore document and protected by field-validating security rules.

## Getting started

### Android

Install JDK 21 and Android Studio with Android SDK 37. Copy your Firebase Android configuration to `app/google-services.json`, then run:

```powershell
.\gradlew.bat assembleProdDebug
.\gradlew.bat testProdDebugUnitTest
```

The example Firebase file allows debug compilation but not real authentication. Release builds require real Firebase configuration and signing material. See [Android Studio setup](ANDROID_STUDIO.md).

### Web

Install Node.js 20 or newer, copy `web/.env.example` to `web/.env.local`, and add the Firebase web configuration:

```bash
cd web
npm install
npm run dev
```

See [web development and deployment](web/README.md) and [Firebase setup](FIREBASE_SETUP.md).

## Development

```bash
# Web unit, type, CSS, and production-build checks
cd web
npm test
npm run lint
npm run lint:css
npm run build

# Firestore rules and repository integration tests (JDK 21 required)
npm run test:rules
npm run test:emulator

# Android unit, lint, and debug-build checks, from the repository root
./gradlew testProdDebugUnitTest lintProdDebug assembleProdDebug
```

CI also runs Android instrumentation tests and an R8 release build. Version tags matching `vMAJOR.MINOR.PATCH` run the test gates, build and verify the signed APK, launch it on an emulator, and publish a GitHub Release. Operational constraints and the release checklist are documented in [Maintaining Ausgegeben](docs/maintenance.md).

## Privacy

Financial records are stored in the user's Cloud Firestore account and cached locally for offline use. Firestore rules isolate each user's data. The project does not include advertising or analytics SDKs.

Optional web error reporting can send an error message, stack trace, page path, browser user-agent, and bounded technical context to the project's Cloudflare Worker. It can be disabled from Settings. The reporter filters account identifiers, authentication data, and financial fields; reports are retained only in Worker logs.

## Maintainer

[shareef01](https://github.com/shareef01)

## License

[MIT](LICENSE)
