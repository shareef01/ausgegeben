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
firebase deploy --only firestore:rules,storage
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

This builds the PWA and deploys hosting (`aus01`), Firestore rules, and Storage rules from the repo root.

## Sync

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`
- Storage receipts: `users/{uid}/receipts/{id}`
- Use the **same email/password** on Android and the PWA

## Offline mode

Users can tap **Continue offline** on first launch. Data stays in local Room (Android) or IndexedDB (web) until they sign in.

## Config files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting + Firestore + Storage (repo root) |
| `.firebaserc` | Default project `ausgegeben01` |
| `firestore.rules` | Per-user data access |
| `storage.rules` | Receipt image access |
| `app/google-services.json` | Android config (gitignored, per developer) |
| `web/.env.local` | Web Firebase keys (gitignored) |
