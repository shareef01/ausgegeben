# Android Studio — branch `cursor/android-micro-polish-unified-0bfe`

Use this branch for the **polished Android UI** (micro-polish), **10 theme options**, **Firebase email auth**, and **Firestore sync** with the PWA.

Do **not** use `cursor/android-sync-fix-no-google-0bfe` for Android — that branch has an older Android UI.

## Get the correct branch (Windows PowerShell)

```powershell
cd C:\Users\shareef01\AndroidStudioProjects\ausgegeben

# Back up your Firebase config
Copy-Item app\google-services.json google-services.json.backup -ErrorAction SilentlyContinue

git fetch origin
git checkout cursor/android-micro-polish-unified-0bfe
git reset --hard origin/cursor/android-micro-polish-unified-0bfe

# Restore YOUR Firebase file
Copy-Item google-services.json.backup app\google-services.json -ErrorAction SilentlyContinue
```

If the unified branch is not pushed yet, use the UI-only branch:

```powershell
git checkout cursor/micro-polish-ui-0bfe
git reset --hard origin/cursor/micro-polish-ui-0bfe
```

## Open in Android Studio

1. **File → Open** → select the **`ausgegeben`** folder (repo root, not `app/`)
2. Wait for **Gradle Sync**
3. **Gradle JDK:** 17 (Settings → Build → Gradle)
4. Install **Android SDK 37** if sync fails (SDK Manager)
5. Run **app** (green play button)

## Firebase setup

1. [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**
2. Register Android app `com.aus.ausgegeben`
3. Download **`google-services.json`** → save as **`app/google-services.json`** (gitignored)
4. Enable **Authentication → Email/Password**

On first build without the file, Gradle copies from `app/google-services.json.example` (placeholder only).

## What this branch includes

- **UI:** Vibrant green/red FinTech palette, shadows, spacing, chart polish, cash flow, refined add-transaction layout
- **Themes:** System, Light, Dark, AMOLED, Midnight, Ocean, **Forest**, **Sunset**, **Lavender**, Soft Light
- **Auth:** Email/password sign-in (same account as https://aus01.web.app)
- **Sync:** Firestore cloud sync — auto-pull on app open and resume; **Settings → Account → Sync now**
- **Offline:** “Continue offline” on first launch skips cloud

## Build from terminal

```powershell
.\gradlew :app:assembleDebug
```

APK: `app\build\outputs\apk\debug\app-debug.apk`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Wrong/old UI (muted sage colors) | You’re on the wrong branch — use commands above |
| Gradle sync failed | JDK 17, SDK 37, **File → Invalidate Caches → Restart** |
| `setStorageMode` errors | `git merge --abort`, then `git reset --hard origin/cursor/android-micro-polish-unified-0bfe` |
| Sync not pulling PWA data | Sign in with the **same email/password** as the web app; tap **Sync now** in Settings |

See also `app/FIREBASE_SETUP.md` and `FIREBASE_SETUP.md`.
