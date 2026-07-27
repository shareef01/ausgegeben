# Ausgegeben

*German for "spent"* — a personal finance tracker for **Android** and the **web**, sharing one Firebase backend so your data follows you across devices in real time.

[![CI](https://github.com/shareef01/ausgegeben/actions/workflows/ci.yml/badge.svg)](https://github.com/shareef01/ausgegeben/actions/workflows/ci.yml)
![Android](https://img.shields.io/badge/Android-Jetpack%20Compose-3DDC84?logo=android&logoColor=white)
![Web](https://img.shields.io/badge/Web-React%2019%20PWA-61DAFB?logo=react&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)

**Try it now:** [aus01.web.app](https://aus01.web.app) · installable as a PWA

- **Track** expenses, income, and transfers with notes and custom categories
- **Understand** your money — budgets, category breakdowns, cash-flow trends
- **Everywhere** — add a transaction on your phone, see it on the web instantly
- **Private by design** — no third-party analytics or trackers; per-user data isolation; CSV export so you're never locked in

---

## Screenshots

Every screen ships in matching **light and dark** themes.

### Web

| | Light | Dark |
|---|---|---|
| **Record** | ![Web Record — light](docs/screenshots/web/web-record-light.png) | ![Web Record — dark](docs/screenshots/web/web-record-dark.png) |
| **Insights** | ![Web Insights — light](docs/screenshots/web/web-insights-light.png) | ![Web Insights — dark](docs/screenshots/web/web-insights-dark.png) |
| **Add Transaction** | ![Web Add Transaction — light](docs/screenshots/web/web-add-transaction-light.png) | ![Web Add Transaction — dark](docs/screenshots/web/web-add-transaction-dark.png) |
| **Settings** | ![Web Settings — light](docs/screenshots/web/web-settings-light.png) | ![Web Settings — dark](docs/screenshots/web/web-settings-dark.png) |

### Android

| Record | Insights | Settings |
|---|---|---|
| ![Android Record — light](docs/screenshots/android/record-light.png) | ![Android Insights — light](docs/screenshots/android/bills-light.png) | ![Android Settings — light](docs/screenshots/android/settings-light.png) |
| ![Android Record — dark](docs/screenshots/android/record-dark.png) | ![Android Insights — dark](docs/screenshots/android/bills-dark.png) | ![Android Settings — dark](docs/screenshots/android/settings-dark.png) |

---

## Features

| | |
|---|---|
| **Transactions** | Expense / income / transfer with notes, undo-able delete, duplicate, search |
| **Categories** | Full CRUD with a curated icon & color library; deleting a category reassigns linked transactions |
| **Insights** | Real-time balance, monthly budget bar, per-category donut charts, cash-flow graph, flexible analysis periods |
| **Sync** | Firebase Auth + Cloud Firestore; preferences (theme, locale, currency, budget) sync cross-device with last-write-wins |
| **Personalization** | Multiple theme modes (system / light / dark / AMOLED / …), English & German localization |
| **Reminders** | Daily notification at a configurable time on **Android** (WorkManager; survives reboots). Preference syncs to web; notifications are Android-only |
| **Portability** | One-tap CSV export on both platforms |

---

## Architecture

Two clients, one serverless backend. There is **no custom API server** — clients talk to Firebase directly. Ownership and field schema are enforced in [Firestore security rules](firestore.rules).

### System overview

```mermaid
flowchart TB
  subgraph clients [Clients]
    Android["Android<br/>Kotlin · Jetpack Compose<br/>MVVM · Flow · DataStore"]
    Web["Web PWA<br/>React 19 · TypeScript<br/>Vite · Zustand"]
  end

  subgraph firebase [Firebase]
    Auth["Authentication<br/>Email / password"]
    FS["Cloud Firestore"]
    Host["Hosting<br/>aus01.web.app"]
    Rules["Security Rules<br/>+ App Check"]
  end

  Android --> Auth
  Web --> Auth
  Android --> FS
  Web --> FS
  Web --> Host
  Auth --> Rules
  FS --> Rules
```

### Data model

Every document lives under the signed-in user. The `users/{uid}` document itself is not readable or writable — only subcollections are.

```mermaid
flowchart LR
  U["users/{uid}"]
  U --> E["expenses/{id}<br/>amount · date · categoryId<br/>note · transactionType"]
  U --> C["categories/{id}<br/>name · icon · color<br/>type · sortOrder"]
  U --> S["settings/preferences<br/>theme · locale · currency<br/>budget · reminders"]
  U --> M["meta/dedupe<br/>one-time category cleanup"]
```

### Client layers

Both apps follow the same shape: UI → view-model → repository → Firestore.

```mermaid
flowchart TB
  subgraph android [Android]
    AUI["Compose screens<br/>Record · Insights · Settings"]
    AVM["ViewModels<br/>StateFlow"]
    AREPO["AppRepository<br/>AuthRepository"]
    AUI --> AVM --> AREPO
  end

  subgraph web [Web]
    WUI["React views<br/>Record · Insights · Settings"]
    WVM["Hooks / view-models"]
    WREPO["expenseRepository<br/>authService · preferencesSync"]
    WUI --> WVM --> WREPO
  end

  FS[(Cloud Firestore)]
  AREPO --> FS
  WREPO --> FS
```

**Android** — Jetpack Compose (Material 3) with a custom design system. Cold Firestore listener flows keyed to auth state, exposed as `StateFlow`. Offline cache keeps the app usable without a network; DataStore holds local preferences.

**Web** — React 19 + TypeScript (Vite). Zustand stores fed by the same Firestore documents and rules as Android, including matching starter categories. Installable PWA with a precached shell.

**Backend** — Email/password Firebase Auth (App Check: Play Integrity on Android; reCAPTCHA Enterprise required for web production). Queries are range-scoped where possible to keep Firestore reads modest.

---

## Getting Started

**Prerequisites:** JDK 17 + Android Studio (Android) · Node.js 20+ (web) · a Firebase project — see **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**.

### Android

```bash
# Place your Firebase config first: app/google-services.json
./gradlew assembleDebug          # build
./gradlew testDebugUnitTest      # unit tests
```

A placeholder `google-services.json` is generated automatically so the project compiles out of the box; real sign-in needs your own. Android Studio specifics: [ANDROID_STUDIO.md](ANDROID_STUDIO.md).

### Web

```bash
cd web
cp .env.example .env.local       # fill in your Firebase web config
npm install
npm run dev                      # http://localhost:5173
npm test                         # vitest
npm run deploy                   # build + deploy hosting & Firestore rules
```

More detail in [web/README.md](web/README.md).

---

## Quality

- **CI** ([workflow](.github/workflows/ci.yml)): every push and PR runs Android unit tests + debug build, web type-check/tests/`npm audit`/production build, and Firestore security-rules tests against the emulator.
- **Static safety:** strict TypeScript, schema-validating Firestore rules, R8-minified Android releases.
- **Hosting hardening:** CSP, HSTS, frame-ancestors denial, restrictive Permissions-Policy ([firebase.json](firebase.json)).
- **Privacy:** no third-party analytics or trackers.

---

## Project Structure

```
ausgegeben/
├── app/                 # Android — Kotlin, Compose, WorkManager
├── web/                 # Web PWA — React, TypeScript, Vite
├── docs/screenshots/    # README screenshots (android/ + web/)
├── firestore.rules      # Per-user isolation + field-level schema validation
├── firebase.json        # Hosting config, security headers, rules deployment
├── scripts/             # Maintenance utilities
└── .github/workflows/   # CI for both platforms
```

---

## Author

**[shareef01](https://github.com/shareef01)**
