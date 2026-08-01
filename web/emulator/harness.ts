/**
 * Emulator harness for exercising expenseRepository against a real Firestore.
 *
 * The repository's interesting logic — dedupe, category delete, orphan repair,
 * batch chunking — is built from getDocs/writeBatch/deleteDoc and does nothing
 * observable without a server. Mocking the SDK would test the mock, so these run
 * against the Firestore emulator (free, local, already used by the rules suite).
 *
 * Rules are deliberately left open here. Permission behaviour has its own 29-test
 * suite in ../rules; loading the real ruleset would only mean every write failed
 * for want of an auth token and told us nothing about the repository's logic.
 * The repository's own client-side gate (requireVerifiedEmail) reads the auth
 * store rather than a token, so signInTestUser is enough to satisfy it.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { useAuthStore } from '@/services/authStore';

export const PROJECT_ID = 'demo-ausgegeben-repo';
export const TEST_UID = 'repo-test-user';

const HOST = '127.0.0.1';
const PORT = 8080;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let testEnv: RulesTestEnvironment | null = null;

/** The instance the repository is pointed at (see the vi.mock in the test file). */
export function emulatorFirestore(): Firestore {
  if (!db) throw new Error('harness not started — call startHarness() in beforeAll');
  return db;
}

export async function startHarness(): Promise<void> {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: 'rules_version = "2";\nservice cloud.firestore {\n  match /databases/{db}/documents {\n    match /{document=**} { allow read, write: if true; }\n  }\n}',
      host: HOST,
      port: PORT,
    },
  });

  // A plain SDK app, not a rules-unit-testing context: the repository reaches for
  // the app-wide Firestore singleton, so the thing it gets has to behave like one.
  app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator', appId: 'emulator' }, 'repo-tests');
  db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, PORT);
}

export async function stopHarness(): Promise<void> {
  await testEnv?.cleanup();
  testEnv = null;
  if (app) await deleteApp(app);
  app = null;
  db = null;
}

export async function resetHarness(): Promise<void> {
  await testEnv?.clearFirestore();
  signOutTestUser();
}

export function signInTestUser(emailVerified = true): void {
  useAuthStore.setState({
    user: {
      uid: TEST_UID,
      email: 'repo-test@example.com',
      displayName: null,
      emailVerified,
    },
  });
}

export function signOutTestUser(): void {
  useAuthStore.setState({ user: null });
}
