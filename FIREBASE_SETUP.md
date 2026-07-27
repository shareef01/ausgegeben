# Firebase setup

Project: **ausgegeben01** · PWA: [aus01.web.app](https://aus01.web.app)

## Android

1. [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**
2. Add Android app → package `com.aus.ausgegeben`
3. Download `google-services.json` → `app/google-services.json`
4. **Authentication** → enable **Email/Password** only
5. **Firestore** → create database
6. Deploy rules from repo root:

```bash
firebase deploy --only firestore:rules
```

Release builds **fail** if `google-services.json` still contains placeholder `YOUR_*` values. Debug may auto-copy from `app/google-services.json.example` so the project compiles.

## Web (PWA)

1. Add a **Web** app in the same Firebase project
2. Copy config to `web/.env.local` (see `web/.env.example`)
3. Set **`VITE_FIREBASE_APP_CHECK_KEY`** (reCAPTCHA Enterprise site key) for production builds — the web client throws at runtime in production if it is missing
4. In Firebase Console → **App Check**: register the web app, then enforce App Check for **Authentication** and **Cloud Firestore**
5. Restrict the Web API key by HTTP referrer in Google Cloud Console
6. Build and deploy from `web/`:

```bash
cd web
npm install
npm run deploy
```

This builds the PWA and deploys hosting (`aus01`) + Firestore rules from the repo root.

## Sync

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`, `users/{uid}/settings/preferences`
- Use the **same email/password** on Android and the PWA
- Sign-in is **required** on both clients
- Both clients use Firestore offline persistence (Android disk cache; web IndexedDB)
- Expense and category writes require a **verified email**; preferences may sync before verification

## App Check

| Client | Provider |
|--------|----------|
| Android | Play Integrity (debug provider in debug builds) |
| Web | reCAPTCHA Enterprise via `VITE_FIREBASE_APP_CHECK_KEY` (required in production) |

## Config files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting + Firestore + emulators |
| `.firebaserc` | Default project `ausgegeben01` |
| `firestore.rules` | Per-user data access + schema validation |
| `app/google-services.json` | Android config (gitignored, per developer) |
| `web/.env.local` | Web Firebase keys (gitignored) |
| `web/.env.production` | Production web keys (gitignored; never commit) |
