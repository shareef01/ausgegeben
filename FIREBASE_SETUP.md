# Firebase setup

Project: **ausgegeben01** · PWA: [aus01.web.app](https://aus01.web.app)

For release checks, legacy schema compatibility, and production-specific constraints, see [Maintaining Ausgegeben](docs/maintenance.md).

## Android

1. [Firebase Console](https://console.firebase.google.com/) → project **ausgegeben01**
2. Add Android app → package `com.aus.ausgegeben` (production / `prod` flavor)
3. Download `google-services.json` → `app/google-services.json`
4. **Authentication** → enable **Email/Password** only
5. **Firestore** → create database
6. Deploy rules from repo root:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Rules and indexes go together — several rule-gated aggregate queries depend on
composite indexes including the aggregated field; deploying rules alone can
leave those queries failing with FAILED_PRECONDITION.

Build variants: `assembleProdDebug` (default CI) and `assembleProdRelease` (signed, used by the release workflow). To test against local emulators instead of production, see the emulator section below.

Release builds **fail** if `google-services.json` still contains placeholder `YOUR_*` values. Debug may auto-copy from `app/google-services.json.example` so the project compiles.

## Web (PWA)

1. Add a **Web** app in the same Firebase project
2. Copy config to `web/.env.local` (see `web/.env.example`)
3. Set **`VITE_FIREBASE_APP_CHECK_KEY`** (reCAPTCHA Enterprise site key) — **required for production builds** when Firebase is configured
4. In Firebase Console → **App Check**, register the web app. Do not enable
   enforcement until both clients have produced healthy valid-request metrics;
   use the rollout below. Firestore rules remain the authorization boundary.
5. Restrict the Web API key by HTTP referrer in Google Cloud Console (and rotate if it ever leaked via git history)
6. Build and deploy from `web/`:

```bash
cd web
npm install
npm run deploy
```

This builds the PWA and deploys hosting (`aus01`) + Firestore rules and indexes from the repo root.

## Sync

- Firestore paths: `users/{uid}/categories/{id}`, `users/{uid}/expenses/{id}`, `users/{uid}/settings/preferences`
- Use the **same email/password** on Android and the PWA
- Sign-in is **required** on both clients
- Android uses Firestore disk persistence. Web defaults to memory-only and enables
  IndexedDB only when the user explicitly marks the browser as a trusted device.
- Expense, category, and preferences writes require a **verified email** (local prefs still work before verification)
- **Shared devices:** web coordinates other tabs and retries IndexedDB erasure; Android
  clears account-scoped DataStore prefs and the Firestore disk cache. Either client
  surfaces cleanup failure and directs the user to clear site/app storage.

## Incomplete account deletion

Account deletion remains compatible with the Firebase Spark plan. Deploy the hardened
rules before releasing clients that use the resumable deletion protocol:

```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting:aus01
```

Both clients reauthenticate and force-refresh the ID token. Firestore rules require an
`auth_time` no more than five minutes old before accepting the permanent
`meta/accountDeletion` write-freeze tombstone. Clients then use server-only reads to
delete and verify every known account collection before deleting the Auth identity. If
the operation is interrupted or quota-limited, retry **Finish deletion**; there is no
client permission to remove the tombstone and reopen a potentially partial account.

## App Check

| Client | Provider |
|--------|----------|
| Android | Play Integrity (debug provider in debug builds) |
| Web | reCAPTCHA Enterprise via `VITE_FIREBASE_APP_CHECK_KEY` (**required in production**) |

### GitHub-distributed Android configuration

Play Integrity supports APKs distributed outside Google Play. The app does not
need a Play Store listing or Play publication, but Google currently requires the
package to be added in Play Console so its Play Integrity API can be linked to the
same Cloud/Firebase project.

1. In Play Console, add `com.aus.ausgegeben`, open **App integrity**, and link the
   Play Integrity API to the `ausgegeben01` Cloud project. Do not create or publish
   a store release.
2. In Firebase App Check, register the Android app with the SHA-256 fingerprint of
   the certificate pinned in `.github/release-cert.sha256`.
3. In the Android app's advanced Play Integrity settings choose the official
   **exclusively outside Google Play** profile: `PLAY_RECOGNIZED` not required,
   `LICENSED` not required, minimum acceptable level **Device integrity**. The
   default `PLAY_RECOGNIZED` requirement would reject the GitHub APK.
4. Keep the default one-hour token TTL unless observed quota/latency data supports
   another value. Shorter TTLs attest more often.

### Enforcement rollout

1. Release App Check-capable Android and web clients while enforcement is off.
2. Confirm App Check metrics show valid requests from the signed GitHub APK, the
   production PWA, and registered debug/test environments. Test a clean sideload,
   an upgrade, offline-to-online recovery, and a non-Play-supported device.
3. Enable enforcement for **Cloud Firestore first**, wait at least 15 minutes, and
   repeat signed-in CRUD, category migration, export, and account-deletion tests on
   both clients. Roll back enforcement if legitimate traffic is rejected.
4. Leave Authentication enforcement off unless an explicit product decision accepts
   the Firebase Authentication with Identity Platform upgrade and its Spark limit
   (currently 3,000 daily active users for email/social/anonymous/custom providers).
   App Check for Authentication requires that upgrade.

App Check limits requests to attested app instances; it does not replace Firebase
Auth, ownership checks, schema validation, or abuse-aware quotas.

## API key hygiene

Firebase web/Android API keys are client-visible by design, but still restrict them:

1. Google Cloud Console → APIs & Services → Credentials
2. Web key: HTTP referrers → `aus01.web.app/*`, `https://aus01.firebaseapp.com/*` (plus localhost for dev if needed)
3. Android key: package `com.aus.ausgegeben` + release/debug SHA-1/256
4. If a key was committed historically, restrict it immediately; rotate if unrestricted abuse appears
5. Keep the Android key’s SHA-1 list in sync with Firebase → Project settings → Android app fingerprints (PC debug + device debug + release; same fingerprints on both packages)

## Config files

| File | Purpose |
|------|---------|
| `firebase.json` | Hosting + Firestore + local emulators |
| `.firebaserc` | Default project `ausgegeben01` |
| `firestore.rules` | Per-user data access + schema validation |
| `app/google-services.json` | Android config (gitignored, per developer) |
| `web/.env.local` | Web Firebase keys (gitignored) |
| `web/.env.production` | Production web keys (gitignored; never commit) |
