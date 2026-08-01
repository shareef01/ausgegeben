/**
 * Second emulator harness, this one with firestore.rules actually enforced.
 *
 * The sibling harness runs with open rules to test repository *logic*. This one
 * exists for the questions where the rules are the point — specifically whether a
 * document the rules reject can take healthy documents down with it, since a
 * Firestore batch either commits entirely or not at all.
 *
 * authenticatedContext().firestore() returns a real Firestore carrying the given
 * token claims, so it can stand in for the app-wide singleton the repository
 * reaches for while still being subject to the ruleset.
 */
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAuthStore } from '@/services/authStore';

export const PROJECT_ID = 'demo-ausgegeben-enforced';
export const TEST_UID = 'enforced-test-user';

let testEnv: RulesTestEnvironment | null = null;
let db: Firestore | null = null;

export function enforcedFirestore(): Firestore {
  if (!db) throw new Error('enforced harness not started');
  return db;
}

export function rulesEnv(): RulesTestEnvironment {
  if (!testEnv) throw new Error('enforced harness not started');
  return testEnv;
}

export async function startEnforcedHarness(): Promise<void> {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  // @firebase/rules-unit-testing bundles its own copy of the Firestore types, so the
  // instance is structurally identical but nominally a different type. The cast is the
  // seam between the two declaration sets, not a claim about the runtime object.
  db = testEnv
    .authenticatedContext(TEST_UID, { email_verified: true })
    .firestore() as unknown as Firestore;
  useAuthStore.setState({
    user: {
      uid: TEST_UID,
      email: 'enforced-test@example.com',
      displayName: null,
      emailVerified: true,
    },
  });
}

export async function stopEnforcedHarness(): Promise<void> {
  await testEnv?.cleanup();
  testEnv = null;
  db = null;
  useAuthStore.setState({ user: null });
}

export async function resetEnforcedHarness(): Promise<void> {
  await testEnv?.clearFirestore();
}
