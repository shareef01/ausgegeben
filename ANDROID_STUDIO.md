# Android Studio setup

## Quick start (recommended)

Use a **clean checkout** of the sync branch — avoids merge conflicts from old local edits.

### Windows (PowerShell)

```powershell
cd C:\Users\shareef01\AndroidStudioProjects

# Back up your real Firebase config if you have one
Copy-Item ausgegeben\app\google-services.json ausgegeben\google-services.json.backup -ErrorAction SilentlyContinue

# Abort any half-finished merge
cd ausgegeben
git merge --abort 2>$null
git rebase --abort 2>$null

# Reset to the sync branch (discards local code changes)
git fetch origin
git checkout cursor/android-firestore-sync-0bfe
git reset --hard origin/cursor/android-firestore-sync-0bfe

# Restore YOUR Firebase file (from Firebase Console download)
Copy-Item google-services.json.backup app\google-services.json -ErrorAction SilentlyContinue
```

If you never downloaded Firebase config yet, Gradle creates a **placeholder** from `app/google-services.json.example` on first build. Replace it later for real sign-in.

### Open in Android Studio

1. **File → Open** → select the **`ausgegeben`** folder (repo root)
2. Wait for **Gradle Sync** to finish
3. **File → Sync Project with Gradle Files** if needed
4. Select run target **app** → click **Run** (green play)

Requires **JDK 17** and **Android SDK 37** (install via SDK Manager if sync fails).

---

## If you hit merge conflicts

Do **not** merge into `main` with local changes. Either:

| Situation | Action |
|-----------|--------|
| Only `google-services.json` changed | Reset branch (commands above), restore backup |
| Conflicts in `.kt` / `libs.versions.toml` | `git merge --abort`, then `git reset --hard origin/cursor/android-firestore-sync-0bfe` |
| You need to keep local code | Resolve in **Git → Resolve Conflicts**, keep **Incoming** for sync files |

Sync-related files (prefer **incoming / theirs** from `cursor/android-firestore-sync-0bfe`):

- `PreferenceManager.kt`
- `DashboardViewModel.kt`
- `SettingsScreen.kt`
- `CloudSettingsSection.kt`
- `sync/*`
- `gradle/libs.versions.toml` (must include Firebase entries)

`app/google-services.json` is **gitignored** — never commit it; keep your local copy from Firebase.

---

## Build from terminal

```powershell
cd ausgegeben
.\gradlew :app:assembleDebug
```

APK output: `app\build\outputs\apk\debug\app-debug.apk`

---

## Firebase (for cloud sync)

See `app/FIREBASE_SETUP.md`:

1. Register Android app `com.aus.ausgegeben` in Firebase project **ausgegeben01**
2. Download `google-services.json` → `app/google-services.json`
3. Enable Email/Password auth
4. Add debug SHA-1 for Google Sign-In (`.\gradlew :app:signingReport`)

In the app: **Settings → Cloud sync** → sign in with the same account as https://aus01.web.app

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Gradle sync failed | **File → Invalidate Caches → Restart**; set Gradle JDK to 17 |
| SDK 37 not found | SDK Manager → install Android API 37 |
| `google-services.json` missing | Copy `app/google-services.json.example` to `app/google-services.json` |
| Sign-in fails | Replace placeholder with real Firebase download; enable Auth in console |
| App installs but crashes on start | **Build → Clean Project**, then **Rebuild** |
