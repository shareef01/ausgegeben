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

## Implemented (Phase 0–3)

- [x] PWA manifest + service worker (auto-update)
- [x] IndexedDB schema + default category seed
- [x] 10 theme modes via CSS variables
- [x] Onboarding + offline auth gate
- [x] **Record**: summary card, period pill, search, type chips, grouped list, FAB
- [x] **Add/edit transaction**: numpad, categories, date, note
- [x] **Insights**: period selector, donuts (compact rings), overview, cash-flow trend
- [x] **Settings**: theme, currency, budget, categories, CSV export, offline banner
- [x] Category management (basic CRUD)
- [x] **German locale** (EN/DE) with language picker in Settings
- [x] **Receipt attach** (camera/file) stored as IndexedDB blobs
- [x] **Budget progress bar** on Record tab when monthly limit is set
- [x] **Swipe-delete** with undo toast; long-press to duplicate
- [x] **Firebase Auth** (email/password + Google) with offline fallback
- [x] **Firestore sync** at `users/{uid}/categories/{id}` and `users/{uid}/expenses/{id}`

## Roadmap (next phases)

| Phase | Features |
|-------|----------|
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

Copy `web/.env.example` to `web/.env.local` and fill in values from the Firebase Console (Web app):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

**Firebase Console setup:**

1. Create or open your Firebase project
2. Add a **Web** app and copy the config values above
3. Enable **Authentication** → Email/Password and Google providers
4. Create a **Firestore** database (production or test mode)
5. Add your PWA host to **Authentication → Settings → Authorized domains** (include `localhost` for dev)

Firestore security rules (adjust for production):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Without env vars the app runs fully offline — cloud sign-in is hidden until configured.

## Parity notes

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`
- Preferences stay local on Android too (except sync metadata)
- Receipt images: local IndexedDB blobs in web; cross-device needs Firebase Storage (planned)
