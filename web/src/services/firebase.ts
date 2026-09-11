import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import {
  getToken as getAppCheckToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

/**
 * Dev-only: point Auth/Firestore at the local emulators (firebase.emulator.json)
 * when running `vite --mode emulator` with VITE_FIREBASE_USE_EMULATORS=true.
 * Guarded by import.meta.env.DEV so production bundles can never opt in.
 */
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let appCheck: AppCheck | null = null;
const CACHE_CLEAR_MESSAGE = 'clear-firestore-cache';
const PERSISTENT_STORAGE_KEY = 'ausgegeben-trusted-device-persistence';
const cacheChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('ausgegeben-firestore-lifecycle')
  : null;

cacheChannel?.addEventListener('message', (event) => {
  if (event.data !== CACHE_CLEAR_MESSAGE) return;
  void clearLocalFirestoreCache(false).catch((error) => {
    console.warn('[firebase] another tab requested cache clearing, but it failed', error);
  });
});

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      appId: firebaseConfig.appId,
    });
    const appCheckKey = import.meta.env.VITE_FIREBASE_APP_CHECK_KEY?.trim();
    if (appCheckKey) {
      if (!appCheck) {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(appCheckKey),
          isTokenAutoRefreshEnabled: true,
        });
      }
    } else if (import.meta.env.PROD) {
      // Fail closed: production must ship with reCAPTCHA Enterprise so Console
      // enforcement of Auth/Firestore App Check cannot brick legitimate clients.
      throw new Error(
        '[firebase] VITE_FIREBASE_APP_CHECK_KEY is required in production. ' +
          'Set the reCAPTCHA Enterprise site key, then enforce App Check in Firebase Console.',
      );
    } else {
      console.warn(
        '[firebase] App Check skipped (no VITE_FIREBASE_APP_CHECK_KEY). ' +
          'Required for production builds; add it before enforcing App Check in Firebase Console.',
      );
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) {
    auth = getAuth(firebaseApp);
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!firestore) {
    // Sensitive financial persistence is explicit trusted-device consent. The default
    // memory cache supports an active offline session but leaves nothing for a later
    // browser restart; IndexedDB is enabled only after the user opts in.
    // Must be the FIRST call that touches Firestore for this app instance:
    // initializeFirestore throws if getFirestore() was already called for `app`.
    firestore = initializeFirestore(firebaseApp, {
      localCache: isPersistentStorageEnabled()
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache(),
    });
    if (useEmulators) {
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    }
  }
  return firestore;
}

/**
 * Drop the IndexedDB offline cache after sign-out / account deletion so the
 * next person on a shared browser does not see prior expenses from disk.
 * Coordinates termination with current app tabs and rejects when local erasure cannot
 * be confirmed. Firebase does not promise secure overwrite; this only removes the SDK
 * cache and makes any failure visible to the caller.
 */
export async function clearLocalFirestoreCache(notifyOtherTabs = true): Promise<void> {
  // Server-side rendering and unit-test runtimes have no browser database to erase.
  if (typeof indexedDB === 'undefined') return;
  if (notifyOtherTabs && cacheChannel) {
    cacheChannel.postMessage(CACHE_CLEAR_MESSAGE);
    // Give peer tabs time to terminate their SDK instance before IndexedDB deletion.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // IndexedDB may predate this page load even when no Firestore singleton has been
  // requested yet. Initialize solely so the SDK can terminate and clear that cache.
  const db = firestore ?? getFirebaseFirestore();
  if (!db) return;
  firestore = null;
  await terminate(db);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await clearIndexedDbPersistence(db);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new Error('local_cache_clear_failed', { cause: lastError });
}

/** Token for trusted custom backends. Missing App Check means the report is dropped. */
export async function getBackendAppCheckToken(): Promise<string | null> {
  getFirebaseApp();
  if (!appCheck) return null;
  try {
    return (await getAppCheckToken(appCheck, false)).token;
  } catch {
    return null;
  }
}

/** Persistent financial caches are opt-in for devices the user explicitly trusts. */
export function isPersistentStorageEnabled(): boolean {
  try {
    return localStorage.getItem(PERSISTENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export async function setPersistentStorageEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) localStorage.setItem(PERSISTENT_STORAGE_KEY, 'true');
    else localStorage.removeItem(PERSISTENT_STORAGE_KEY);
  } catch {
    throw new Error('persistent_storage_preference_failed');
  }
  if (!enabled) await clearLocalFirestoreCache();
}
