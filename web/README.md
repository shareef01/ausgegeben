# Ausgegeben Web (PWA)

Progressive Web App replica of the **Ausgegeben** Android finance tracker. Install on iPhone (Add to Home Screen), laptop, or desktop — works offline with IndexedDB.

## Stack choice: React + TypeScript + Vite

| Option | PWA / iPhone | MVVM scalability | Shared with Android |
|--------|----------------|------------------|---------------------|
| **React + TS** ✓ | Excellent PWA support, installable, iOS Safari | ViewModels as hooks + repositories | Logic ported 1:1 from Kotlin |
| Vue 3 | Also strong | Pinia + composables | Same |
| Flutter Web | Heavy bundle, weaker “native web” feel | BLoC / MVVM | Dart only |

**React + TypeScript** was chosen for mature PWA tooling (`vite-plugin-pwa`), crisp mobile Safari behavior, and a clean **Model → Repository → ViewModel (hooks) → View** layering that mirrors your Android app.

## Architecture (MVVM)

```
src/
  models/           # Types (Category, Expense, preferences)
  repositories/     # IndexedDB CRUD (mirrors AppRepository)
  services/         # Database (Dexie), preferences (Zustand), seed data
  viewmodels/       # useRecordViewModel, useDashboardViewModel, …
  views/            # Screens (Record, Insights, Settings, …)
  components/       # Reusable UI (charts, summary card, period pill)
  theme/            # Design tokens + CSS (ported from DesignTokens.kt)
  utils/            # periodUtils, analytics, currency
```

## Implemented (Phase 0–1)

- [x] PWA manifest + service worker (auto-update)
- [x] IndexedDB schema + default category seed
- [x] 10 theme modes via CSS variables
- [x] Onboarding + offline auth gate
- [x] **Record**: summary card, period pill, search, type chips, grouped list, FAB
- [x] **Add/edit transaction**: numpad, categories, date, note
- [x] **Insights**: period selector, donuts (compact rings), overview, cash-flow trend
- [x] **Settings**: theme, currency, budget, categories, CSV export, offline banner
- [x] Category management (basic CRUD)

## Roadmap (next phases)

| Phase | Features |
|-------|----------|
| **2** | German locale, receipt attach (file/camera), budget progress bar, swipe-delete + undo toast |
| **3** | Firebase Auth (email + Google) + Firestore sync (same paths as Android) |
| **4** | Evening reminders (Notification API), onboarding pager animations, chart polish |
| **5** | Firebase Storage for receipts, conflict resolution, preference sync |

## Development

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production PWA in dist/
npm run preview    # test production build
```

### Install on iPhone

1. Deploy `dist/` to HTTPS (required for PWA).
2. Open in Safari → Share → **Add to Home Screen**.

### Firebase (Phase 3)

Create `web/.env.local`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Use the **Web** client from the same Firebase project as Android (`google-services.json`).

## Parity notes

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`
- Preferences stay local on Android too (except sync metadata)
- Receipt images: local IndexedDB blobs in web; cross-device needs Firebase Storage (planned)
