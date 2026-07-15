# Ausgegeben Web (PWA)

Installable web version of **Ausgegeben**. Requires Firebase Auth; expense data lives in Cloud Firestore (with IndexedDB persistence when available). Receipt images stay on-device (browser IndexedDB) — Cloud Storage is not used so the app stays on the **Firebase Spark** free plan.

Settings (theme, locale, currency, budget, reminders) sync at `users/{uid}/settings/preferences`. Empty accounts get the same starter categories as Android.

**Live:** [https://aus01.web.app](https://aus01.web.app)

## Development

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
npm run preview  # test production build
```

## Deploy (Spark-safe)

1. Copy `web/.env.example` → `web/.env.local` with Firebase Web config (Auth + Firestore only)
2. From `web/`:

```bash
npm run deploy
```

Deploys **Hosting** (`aus01`) + **Firestore rules** only. Storage rules are not deployed (`npm run deploy:storage` is opt-in and needs Blaze).

## Structure

```
src/
  models/         # Types
  repositories/   # Firestore CRUD
  services/       # Auth, Firebase, preferences, local receipts
  viewmodels/     # React hooks (MVVM)
  views/          # Screens
  components/     # Shared UI
  theme/          # CSS design tokens
```

See [FIREBASE_SETUP.md](../FIREBASE_SETUP.md) for Firebase Console setup.
