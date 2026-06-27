# Android Firebase setup

The Android app syncs to the same Firestore database as the PWA (`ausgegeben01`).

## One-time Firebase Console steps

1. Open [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**.
2. Add an **Android app** with package name `com.aus.ausgegeben`.
3. Download **`google-services.json`** and save it as **`app/google-services.json`** (this file is gitignored — each machine keeps its own copy).
4. Enable **Email/Password** sign-in under Authentication → Sign-in method.

After replacing `google-services.json`, rebuild the app. Use the same email and password on the PWA and Android app to sync data.

## Using cloud sync

1. Open **Settings → Cloud sync**.
2. Sign in with the **same account** you use on https://aus01.web.app.
3. On first sign-in, local transactions upload to Firestore and remote data merges in.
4. Use **Sync now** to force a full merge.

Firestore paths (same as PWA):

- `users/{uid}/categories/{id}`
- `users/{uid}/expenses/{id}`
- `users/{uid}/preferences/settings`

Receipt images remain device-local for now (`content://` on Android vs Firebase Storage on web).
