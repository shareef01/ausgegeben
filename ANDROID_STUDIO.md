# Android Studio — branch `cursor/micro-polish-ui-0bfe`

This branch includes **UI polish**, **Firebase Auth**, and **Firestore sync**. The project builds cleanly when you use the branch as-is — build failures usually mean a **bad local merge** left old files (e.g. `PreferenceManager.kt` missing `setStorageMode`).

## Fix build errors (Windows PowerShell)

Run in Android Studio **Terminal**:

```powershell
cd C:\Users\shareef01\AndroidStudioProjects\ausgegeben

# Back up your Firebase config
Copy-Item app\google-services.json google-services.json.backup -ErrorAction SilentlyContinue

# Stop any broken merge
git merge --abort 2>$null
git rebase --abort 2>$null

# Reset to the correct branch (discards broken local edits)
git fetch origin
git checkout cursor/micro-polish-ui-0bfe
git reset --hard origin/cursor/micro-polish-ui-0bfe

# Restore YOUR Firebase file
Copy-Item google-services.json.backup app\google-services.json -ErrorAction SilentlyContinue
```

Then in Android Studio:

1. **File → Sync Project with Gradle Files**
2. **Build → Rebuild Project**
3. Run **app**

`git reset --hard` is intentional — it replaces half-merged files with the working branch version.

## Open the project

1. **File → Open** → folder **`ausgegeben`** (repo root, not `app/`)
2. Gradle JDK: **17**
3. Install **Android SDK 37** if sync fails (SDK Manager)

## Build from terminal

```powershell
.\gradlew :app:assembleDebug
```

## Firebase config

`app/google-services.json` is **gitignored**. On first build, Gradle copies from `app/google-services.json.example` if the file is missing.

For real sign-in, download `google-services.json` from Firebase project **ausgegeben01** (package `com.aus.ausgegeben`) and save as `app/google-services.json`.

## What this branch includes

- Auth screen (email, Google, offline mode)
- Cloud sync via Firestore
- UI micro-polish (shadows, spacing, charts, contrast)

After sign-in or **Continue offline**, the main app opens. Cloud sync: **Settings → Account / Sync**.

## Troubleshooting

| Error | Cause | Fix |
|-------|--------|-----|
| `Unresolved reference setStorageMode` | Old `PreferenceManager.kt` from merge | Run reset commands above |
| Gradle sync failed | JDK / SDK | JDK 17, install SDK 37, Invalidate Caches |
| 16 errors in AuthViewModel | Same — incomplete merge | `git reset --hard origin/cursor/micro-polish-ui-0bfe` |

Do **not** pull `cursor/android-firestore-sync-0bfe` into this branch manually — stay on **`cursor/micro-polish-ui-0bfe`**.
