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

## Web (PWA)

1. Add a **Web** app in the same Firebase project
2. Copy config to `web/.env.local` (see `web/.env.example`)
3. Build and deploy from `web/`:

```bash
cd web
npm install
npm run deploy
```

This builds the PWA and deploys hosting (`aus01`) + Firestore rules from the repo root.

## Sync

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`, `users/{uid}/settings/preferences`
- Use the **same email/password** on Android and the PWA
- Web is online-only (no local expense/preferences cache). Sign-in is required.

## Config files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting + Firestore (repo root) |
| `.firebaserc` | Default project `ausgegeben01` |
| `firestore.rules` | Per-user data access |
| `app/google-services.json` | Android config (gitignored, per developer) |
| `web/.env.local` | Web Firebase keys (gitignored) |
