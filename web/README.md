# Ausgegeben Web (PWA)

Installable web version of **Ausgegeben**. Works offline with IndexedDB; optional Firebase sync when signed in with the same account as Android.

**Live:** [https://aus01.web.app](https://aus01.web.app)

## Development

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
npm run preview  # test production build
```

## Deploy

1. Copy `web/.env.example` → `web/.env.local` with Firebase Web config
2. From `web/`:

```bash
npm run deploy
```

Uses `firebase.json` at the repo root (hosting site **aus01**, Firestore + Storage rules).

## Structure

```
src/
  models/         # Types
  repositories/   # IndexedDB CRUD
  services/       # Dexie, auth, sync, preferences
  viewmodels/     # React hooks (MVVM)
  views/          # Screens
  components/     # Shared UI
  theme/          # CSS design tokens
```

See [FIREBASE_SETUP.md](../FIREBASE_SETUP.md) for Firebase Console setup.
