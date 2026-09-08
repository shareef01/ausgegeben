# Ausgegeben Web (PWA)

Installable web version of **Ausgegeben**. It requires Firebase Auth; expense data and preferences live in Cloud Firestore with an IndexedDB offline cache. The project uses the Firebase Spark plan for Hosting, Auth, and Firestore.

Settings (theme, locale, currency, budget, reminders, onboarding) sync at `users/{uid}/settings/preferences`. Empty accounts get the same starter categories as Android.

**Live:** [https://aus01.web.app](https://aus01.web.app)

## Development

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
npm run preview  # test production build
```

## Testing

```bash
npm test          # unit tests (vitest)
npm run lint      # tsc --noEmit
npm run lint:css  # fails on utility classes used in JSX but not defined in src/theme/*.css
npm run test:rules  # Firestore rules against the emulator
npm run validate:prod-env # checks every required production Firebase value without printing it
```

`test:rules` needs **JDK 21+** (firebase-tools dropped Java <21). A JDK 21 being
installed is not enough — the emulator uses whatever `java` is on `PATH`, so if
`java -version` reports 17, point `JAVA_HOME` at a 21 build first:

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.11.10-hotspot"  # adjust path
export PATH="$JAVA_HOME/bin:$PATH"
```

`lint:css` exists because this project hand-writes its utility classes — there is
no Tailwind build — so an undefined class is silently inert rather than a build error.

## Deploy (Spark-safe)

1. Copy `web/.env.example` → `web/.env.production` and fill all five required Firebase/App Check values. The file is gitignored local operational state; recover values from Firebase Console → Project settings and App Check.
2. From `web/`:

```bash
npm run deploy
```

The deploy command validates configuration before building, verifies the values reached the bundle, deploys Hosting + rules + indexes, then preserves the live smoke test. A validation failure touches no production resource.

## Structure

```
src/
  models/         # Types
  repositories/   # Firestore CRUD
  services/       # Auth, Firebase, preferences
  viewmodels/     # React hooks (MVVM)
  views/          # Screens
  components/     # Shared UI
  theme/          # CSS design tokens
```

See [FIREBASE_SETUP.md](../FIREBASE_SETUP.md) for Firebase Console setup.
