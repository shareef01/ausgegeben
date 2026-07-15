import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  /** Unused on Spark — Cloud Storage requires Blaze since 2026-02-03. Kept for config parity. */
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let appCheck: AppCheck | null = null;
let persistenceEnabled = false;
let persistenceAttempted = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      appId: firebaseConfig.appId,
    });
    const appCheckKey = import.meta.env.VITE_FIREBASE_APP_CHECK_KEY;
    if (appCheckKey && !appCheck) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!firestore) {
    firestore = getFirestore(firebaseApp);
  }
  return firestore;
}

/** Enable IndexedDB persistence once. Safe to call multiple times. Spark-compatible. */
export async function enableOfflinePersistence(): Promise<boolean> {
  if (persistenceEnabled) return true;
  if (persistenceAttempted) return persistenceEnabled;
  persistenceAttempted = true;
  const fs = getFirebaseFirestore();
  if (!fs) return false;
  try {
    await enableIndexedDbPersistence(fs);
    persistenceEnabled = true;
    return true;
  } catch (err: unknown) {
    // Failed-precondition = multiple tabs; unimplemented = browser — app still works online
    console.warn('[firebase] IndexedDB persistence unavailable', err);
    return false;
  }
}
