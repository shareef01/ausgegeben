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

## Implemented (Phase 0–5)

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
- [x] **Firebase Auth** (email/password) with offline fallback
- [x] **Firestore sync** at `users/{uid}/categories/{id}` and `users/{uid}/expenses/{id}`
- [x] **Firebase Storage** for receipt images (`users/{uid}/receipts/{id}`)
- [x] **Conflict resolution** via `updatedAt` timestamps + delete tombstones
- [x] **Preference sync** (currency, locale, theme, budget, reminders) to `users/{uid}/preferences/settings`

## Roadmap (next phases)

| Phase | Features |
|-------|----------|
| **4** | Evening reminders (Notification API), onboarding pager animations, chart polish |

## Development

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production PWA in dist/
npm run preview    # test production build
```

### Install on iPhone

1. Deploy to Firebase Hosting (see below) or any HTTPS host.
2. Open in Safari → Share → **Add to Home Screen**.

### Deploy to Firebase Hosting

Project: **ausgegeben01** → PWA hosted at **`https://aus01.web.app`**

> Note: This project has two Hosting sites. The PWA deploys to **`aus01`** (linked to your Web App).  
> `https://ausgegeben01.web.app` is a separate default site and may show Firebase's placeholder page.

1. Ensure `web/.env.local` has your Firebase Web config (used at build time).
2. Install Firebase CLI and log in (once on your machine):

```bash
npm install -g firebase-tools
firebase login
```

3. Deploy from the `web/` folder:

```bash
cd web
npm install
npm run deploy
```

This runs `vite build` then `firebase deploy --only hosting`.

**Live URLs after deploy:**
- https://aus01.web.app ← **use this one (PWA)**
- https://aus01.firebaseapp.com

These domains are automatically authorized for Firebase Auth.

**CI deploy:** set a `FIREBASE_TOKEN` from `firebase login:ci` and run `npm run deploy` in CI.

### Firebase (Phase 3)

Copy `web/.env.example` to `web/.env.local` and fill in values from the Firebase Console (Web app):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
```

**Firebase Console setup:**

1. Create or open your Firebase project
2. Add a **Web** app and copy the config values above
3. Enable **Authentication** → Email/Password provider
4. Create a **Firestore** database (production or test mode)
5. Enable **Storage** and note the bucket name (`VITE_FIREBASE_STORAGE_BUCKET`)
6. Add your PWA host to **Authentication → Settings → Authorized domains** (include `localhost` for dev)

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

Storage security rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/receipts/{receiptId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Sync behavior (Phase 5):**

- Categories, expenses, and preferences carry an `updatedAt` timestamp — newest wins on conflict
- Deletes write tombstones (`deleted: true`) so other devices pick them up
- Receipt blobs upload to Storage; other devices download on sync/view
- Device-local flags (`onboardingComplete`, `authGatewayComplete`, `storageMode`) are not synced

Without env vars the app runs fully offline — cloud sign-in is hidden until configured.

## Parity notes

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`, `users/{uid}/preferences/settings`
- Storage path: `users/{uid}/receipts/{receiptId}`
- Receipt images: cached locally in IndexedDB; uploaded to Firebase Storage when signed in
