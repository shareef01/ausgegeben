# Firebase setup (free tier)

Ausgegeben uses **Firebase Authentication** (email/password) and optional **Firebase Hosting** for a landing page. Both are available on Google's free Spark plan.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. **Add project** → name it (e.g. `ausgegeben-app`)
3. Disable Google Analytics if you want a minimal setup (optional)

## 2. Register the Android app

1. In the project overview, click **Add app** → **Android**
2. Package name: `com.aus.ausgegeben`
3. Download `google-services.json`
4. Replace `app/google-services.json` with the downloaded file

## 3. Enable sign-in methods

1. **Build → Authentication → Get started**
2. Enable **Email/Password**
3. Enable **Google** and add your support email when prompted

## 4. Enable Firestore

1. **Build → Firestore Database → Create database**
2. Start in **test mode** for development, then deploy rules from `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Data is stored per user at `users/{uid}/categories` and `users/{uid}/expenses`

**Important:** Deploy security rules or sync will fail with permission denied:

```bash
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into Firebase Console → **Firestore Database → Rules → Publish**.

## 5. Google Sign-In on Android

Your `google-services.json` must include a **Web client** OAuth entry (client_type 3). The Gradle plugin exposes it as `R.string.default_web_client_id`. Without it, the Google button is hidden.

## 6. Build the Android app

```bash
./gradlew :app:assembleDebug
```

Sign-in and sign-up use Firebase Auth. Users who tap **Continue offline** skip the account and keep all data in local Room storage.

## 5. Deploy hosting (free)

Install the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
```

From the repo root:

```bash
firebase use --add   # select your project
firebase deploy --only hosting
```

Your site will be served at `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`.

Static files live in `hosting/public/`.

## Offline vs cloud mode

| Mode | Behavior |
|------|----------|
| **Offline** | Default choice on auth screen. No Firebase session. Room DB only. |
| **Cloud** | Email/password sign-in or sign-up. Auth state stored in Firebase. Local data remains on device; full sync can be added later via Firestore. |

## Files

- `app/google-services.json` — Android Firebase config (replace with your project file)
- `app/google-services.json.example` — template
- `firebase.json` — Hosting config
- `.firebaserc` — Default project id (`ausgegeben-app`, change after `firebase use`)
- `hosting/public/` — Landing page assets
