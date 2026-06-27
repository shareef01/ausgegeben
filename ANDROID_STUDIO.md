# Android Studio setup

Open the **Ausgegeben** Android app from this repository in Android Studio.

## Quick start (Windows)

```powershell
cd C:\Users\shareef01\AndroidStudioProjects\ausgegeben

# Keep your Firebase config if you already have one
Copy-Item app\google-services.json google-services.json.backup -ErrorAction SilentlyContinue

git pull origin main

Copy-Item google-services.json.backup app\google-services.json -ErrorAction SilentlyContinue
```

## Open the project

1. **File → Open** → select the **`ausgegeben`** folder (repo root).
2. Wait for **Gradle Sync**.
3. **Gradle JDK:** 17 (Settings → Build → Gradle).
4. Install **Android SDK 37** if prompted (SDK Manager).
5. Run the **app** module.

## Firebase

1. [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**
2. Android app package: `com.aus.ausgegeben`
3. Download **`google-services.json`** → save as **`app/google-services.json`**
4. Enable **Authentication → Email/Password**

Without a real `google-services.json`, the build may succeed using the example placeholder, but auth and sync will not work.

## Build from terminal

```powershell
.\gradlew :app:assembleDebug
```

APK: `app\build\outputs\apk\debug\app-debug.apk`

## What you get on `main`

- Polished FinTech UI (vibrant income/expense colors, glass-style cards)
- 10 theme modes
- Email/password auth and Firestore sync with the PWA at [aus01.web.app](https://aus01.web.app)
- Smooth tab navigation, performance-tuned lists and sync
- Offline-first: skip sign-in on first launch if you prefer local-only storage

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Gradle sync failed | JDK 17, SDK 37, **File → Invalidate Caches → Restart** |
| Auth / sync errors | Real `app/google-services.json`, Email/Password enabled in Firebase |
| Web data not on phone | Same email/password as the PWA; **Settings → Sync now** |
| Old muted UI | `git pull origin main` and rebuild |

See also [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
