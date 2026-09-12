# Ausgegeben Web

The web client is the installable PWA for [Ausgegeben](../README.md). It shares the same Firebase Authentication account and Firestore data model as the Android app, so transactions and preferences follow the user between platforms.

**Live app:** [aus01.web.app](https://aus01.web.app)

The project runs on Firebase's Spark plan. It does not require Cloud Functions or a Blaze upgrade.

## Local development

Use Node.js 22 or newer. Copy `.env.example` to `.env.local`, provide your Firebase web configuration, and then run:

```bash
npm ci
npm run dev
```

The development server starts at `http://localhost:5173`. A production build can be checked locally with:

```bash
npm run build
npm run preview
```

## Tests and validation

```bash
npm test                 # Vitest unit tests
npm run lint             # TypeScript checks
npm run lint:css         # Detect utility classes without matching CSS
npm run test:rules       # Firestore rules against the emulator
npm run test:emulator    # Repository integration tests against Firestore
npm run validate:prod-env
```

Firebase's current Firestore emulator requires JDK 21 or newer. It uses the `java` executable on `PATH`, so verify the active version with `java -version` rather than relying on an installed JDK that may not be selected.

The CSS check is intentional. This project keeps its utility classes in source-controlled CSS instead of generating them with Tailwind, which means a misspelled or missing class would otherwise fail silently.

## Firebase emulators

The screenshot and integration-test tools use Firebase's local Authentication and Firestore emulators. This keeps demo data and automated test accounts out of production.

```bash
npx firebase emulators:start --only auth,firestore --project demo-ausgegeben
node scripts/seed-demo-data.mjs
npm run dev -- --mode emulator
```

In a second terminal, run `node scripts/capture-screenshots.mjs` to update the public web screenshots from the seeded account.

## Deployment

Production deployment is deliberately fail-closed:

1. Copy `.env.example` to `.env.production` and fill every required Firebase and App Check value.
2. Run `npm run deploy` from this directory.

The deploy script validates configuration without printing it, builds the PWA, confirms the values reached the bundle, deploys Hosting plus Firestore rules and indexes, and runs the live smoke test. A failed validation does not modify production.

## Source layout

```text
src/components/    Shared interface components
src/models/        Application types
src/repositories/  Firestore reads, writes, and migrations
src/services/      Authentication, Firebase, preferences, and telemetry
src/theme/         Design tokens and source-controlled CSS utilities
src/viewmodels/    UI state and application workflows
src/views/         Screens and navigation shell
```

See [Firebase setup](../FIREBASE_SETUP.md) for the backend configuration and [Maintaining Ausgegeben](../docs/maintenance.md) for release and recovery procedures.
