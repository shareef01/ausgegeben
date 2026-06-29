# Ausgegeben

**Ausgegeben** (*German for “spent”*) is a personal finance tracker I built for Android and the web. Track expenses, income, and transfers; review spending insights; set a monthly budget; and optionally sync across devices with the same email account.

**Live web app:** [aus01.web.app](https://aus01.web.app)

---

## What it does

| Area | Details |
|------|---------|
| **Transactions** | Expenses, income, and transfers with notes, dates, categories, and receipt photos |
| **Record** | Balance summary, budget progress, searchable list, swipe-to-delete with undo |
| **Insights** | Category breakdowns, net totals, and cash-flow trend for the selected period |
| **Categories** | Full CRUD with icons, colors, and per-type grouping |
| **Budget** | Optional monthly spending cap with on-screen progress |
| **Reminders** | Daily notifications on Android (opt-in) |
| **Export** | CSV export from Android or the web app |
| **Sync** | Optional Firebase cloud sync — same account on Android and [aus01.web.app](https://aus01.web.app) |
| **Offline** | Works without an account; data stays on your device until you sign in |
| **Languages** | English and German |

**Android** (Kotlin + Compose) · **Web** (installable PWA) · same Firestore sync when signed in.

---

## Tech stack

### Android

| Layer | Technology |
|-------|------------|
| Language | Kotlin |
| UI | Jetpack Compose, Material 3 |
| Architecture | MVVM — ViewModels, Repository, Room DAOs |
| Database | Room 2.7 (schema v6) |
| Lists | Paging 3 |
| Preferences | DataStore |
| Background | WorkManager (daily reminders) |
| Camera | CameraX + Coil |
| Cloud | Firebase Auth + Firestore |
| Build | AGP 9.2, KSP, Kotlin 2.2 |

### Web (PWA)

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript, Vite |
| Offline DB | Dexie (IndexedDB) |
| State | Zustand |
| PWA | vite-plugin-pwa, service worker |
| Cloud | Firebase Auth + Firestore |

---

## Getting started

### Clone

```bash
git clone https://github.com/shareef01/ausgegeben.git
cd ausgegeben
```

### Android (Android Studio)

1. Open the **repository root** in Android Studio (not the `app/` folder alone).
2. Use **JDK 17** and **Android SDK 37**.
3. Add Firebase config: download `google-services.json` from project **ausgegeben01** and place it at `app/google-services.json`.
4. Enable **Email/Password** in Firebase Authentication.
5. Run the **app** configuration.

```bash
# Windows (PowerShell)
.\gradlew.bat assembleDebug
```

APK output: `app/build/outputs/apk/debug/app-debug.apk`

More detail: [ANDROID_STUDIO.md](ANDROID_STUDIO.md) and [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

### Web (PWA)

```bash
cd web
npm install
npm run dev
```

Production build and deploy:

```bash
cd web
npm run build
npm run deploy
```

Deploy uses `firebase.json` at the repo root (site **aus01**).

Hosted site: [https://aus01.web.app](https://aus01.web.app)

More detail: [web/README.md](web/README.md).

### Sync between Android and web

1. Sign in with the **same email and password** on both apps.
2. On Android: **Settings → Account → Sync now** (also auto-syncs on resume).
3. On web: sync runs after sign-in and when you return to the tab.

Firestore security rules live in `firestore.rules` at the repo root.

---

## Themes

Ten appearance modes on both platforms:

System, Light, Dark, AMOLED, Midnight, Ocean, Forest, Sunset, Lavender, Soft Light.

---

## Tests

```bash
# Android unit tests
.\gradlew.bat testDebugUnitTest

# Web typecheck + build
cd web && npm run build
```

---

## Privacy

Without signing in, everything stays on your device. If you enable cloud sync, categories, transactions, and preferences are stored under your Firebase user account. There is no third-party analytics SDK. CSV export and receipt images are only shared when you choose to.

---

## Project layout

```
ausgegeben/
├── app/                    # Android app (Kotlin, Compose, Room)
├── web/                    # PWA (React, Vite, Dexie)
├── docs/screenshots/       # README images
├── scripts/                # Dev utilities
├── firebase.json           # Firebase hosting + rules
├── firestore.rules
├── storage.rules
└── gradle/                 # Android build
```

---

## License

Provided as-is for personal use. Add a license file if you plan to distribute under specific terms.

---

## Author

Built and maintained by **[Shareef](https://github.com/shareef01)** — [github.com/shareef01/ausgegeben](https://github.com/shareef01/ausgegeben)
