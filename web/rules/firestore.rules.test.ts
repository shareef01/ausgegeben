import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES_PATH = resolve(process.cwd(), '../firestore.rules');
const PROJECT_ID = 'demo-ausgegeben-rules';

const validExpense = {
  amount: 12.5,
  dateMillis: Date.UTC(2024, 5, 15),
  categoryId: 'cat-1',
  note: 'coffee',
  transactionType: 'expense' as const,
};

const validCategory = {
  name: 'Groceries',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense' as const,
  sortOrder: 0,
};

const validPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  updatedAt: Date.UTC(2024, 5, 15),
};

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}, 30_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function expensePath(uid: string, id = 'e1') {
  return `users/${uid}/expenses/${id}`;
}

function categoryPath(uid: string, id = 'c1') {
  return `users/${uid}/categories/${id}`;
}

function prefsPath(uid: string) {
  return `users/${uid}/settings/preferences`;
}

describe('firestore.rules', () => {
  it('denies unauthenticated reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, expensePath('alice'))));
  });

  it('denies parent users/{uid} document access', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(setDoc(doc(db, 'users/alice'), { hack: true }));
  });

  it('allows verified owner to create a valid expense', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, expensePath('alice')), validExpense));
  });

  it('denies unverified owner expense writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, expensePath('alice')), validExpense));
  });

  it('denies other users from reading owner expenses', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), expensePath('alice')), validExpense);
    });
    const bob = testEnv.authenticatedContext('bob', { email_verified: true }).firestore();
    await assertFails(getDoc(doc(bob, expensePath('alice'))));
  });

  it('rejects expense docs with extra fields (hasOnly)', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, expensePath('alice')), { ...validExpense, sneaky: true }),
    );
  });

  it('rejects expense dateMillis outside allowed range', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, expensePath('alice')), {
        ...validExpense,
        dateMillis: Date.UTC(1990, 0, 1),
      }),
    );
  });

  it('allows verified owner category CRUD and denies unverified create', async () => {
    const verified = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(verified, categoryPath('alice')), validCategory));
    await assertSucceeds(deleteDoc(doc(verified, categoryPath('alice'))));

    const unverified = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(unverified, categoryPath('alice', 'c2')), validCategory));
  });

  it('denies unverified owner preferences writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, prefsPath('alice')), validPreferences));
  });

  it('allows verified owner preferences writes', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, prefsPath('alice')), validPreferences));
  });

  it('rejects invalid themeMode on preferences', async () => {
    const db = testEnv.authenticatedContext('alice', { email_verified: true }).firestore();
    await assertFails(
      setDoc(doc(db, prefsPath('alice')), {
        ...validPreferences,
        themeMode: 'neon_disco',
      }),
    );
  });
});
