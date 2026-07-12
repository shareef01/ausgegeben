import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let persistenceEnabled = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp({
      ...firebaseConfig,
      storageBucket: firebaseConfig.storageBucket || `${firebaseConfig.projectId}.appspot.com`,
    });
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

export async function enableOfflinePersistence(): Promise<boolean> {
  if (persistenceEnabled) return true;
  const fs = getFirebaseFirestore();
  if (!fs) return false;
  try {
    await enableIndexedDbPersistence(fs);
    persistenceEnabled = true;
    console.log('[firebase] Offline persistence enabled');
    return true;
  } catch (err: unknown) {
    const code = typeof err === 'object' && err && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'failed-precondition') {
      console.warn('[firebase] Persistence already enabled in another tab');
    } else if (code === 'unimplemented') {
      console.warn('[firebase] Browser does not support persistence');
    }
    return false;
  }
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!storage) storage = getStorage(firebaseApp);
  return storage;
}
