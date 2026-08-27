# Android Studio setup

Open the **Ausgegeben** Android app from this repository in Android Studio.

## Quick start (Windows)

```powershell
cd C:\Users\<you>\AndroidStudioProjects\ausgegeben

# Keep your Firebase config if you already have one
Copy-Item app\google-services.json google-services.json.backup -ErrorAction SilentlyContinue

git pull origin main

Copy-Item google-services.json.backup app\google-services.json -ErrorAction SilentlyContinue
```

## Open the project

1. **File → Open** → select the **`ausgegeben`** folder (repo root).
2. Wait for **Gradle Sync**.
3. **Gradle JDK:** 21 — Android Studio's embedded JBR (Settings → Build → Gradle). If this machine's JBR is broken (see AGENTS.md §4), any JDK 21 works, e.g. `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot`.
4. Install **Android SDK 37** if prompted (SDK Manager).
5. Run the **app** module.

## Firebase

1. [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**
2. Android app package: `com.aus.ausgegeben`
3. Download **`google-services.json`** → save as **`app/google-services.json`**
4. Enable **Authentication → Email/Password**
5. Deploy `firestore.rules` (see [FIREBASE_SETUP.md](FIREBASE_SETUP.md))

Without a real `google-services.json`, debug may compile from the example placeholder, but auth and sync will not work. **Release builds reject placeholders.**

Sign-in is mandatory. Data lives in Firestore under `users/{uid}/…` with offline persistence — there is no local-only mode.

### Release signing (optional)

Copy `keystore.properties.example` → `keystore.properties` (gitignored) and fill in store/key values, **or** set CI env vars `AUSGEGEBEN_STOREFILE`, `AUSGEGEBEN_STOREPASSWORD`, `AUSGEGEBEN_KEYALIAS`, `AUSGEGEBEN_KEYPASSWORD`. When present, `assembleProdRelease` / `bundleProdRelease` use that signing config. (There is no unflavored `assembleRelease` — every variant is `prod`.)

## Build from terminal

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:assembleProdDebug
```

(If that JBR is broken on the machine — `Error: could not open …\lib\jvm.cfg` — point `JAVA_HOME` at a working JDK 21 instead; see AGENTS.md §4.)

APK: `app\build\outputs\apk\prod\debug\app-prod-debug.apk`

## What you get on `main`

- Jetpack Compose UI with multiple theme modes (incl. AMOLED)
- Email/password auth and Firestore sync with the PWA at [aus01.web.app](https://aus01.web.app)
- Record / Insights / Settings tabs, categories, CSV export, daily reminders
- Offline cache after sign-in; email verification required for transactions and categories

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Gradle sync failed | JDK 21, SDK 37, **File → Invalidate Caches → Restart** |
| Auth / sync errors | Real `app/google-services.json`, Email/Password enabled in Firebase |
| Web data not on phone | Same email/password as the PWA; **Settings → Sync now** |
| Release build fails on google-services | Replace placeholder `YOUR_*` values with a Console download |
| Cannot add transactions | Verify email (banner in-app) then tap **I verified** |

See also [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
