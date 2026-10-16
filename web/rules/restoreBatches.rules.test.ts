import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { chunkByCategory } from '../src/utils/restoreBatches';

// Restores merge every backed-up row over the live one. Each expense write reads its
// category, and rules allow 20 document reads per batch, so restore batches must be
// split by category, not only by row count.
const UID = 'alice';
const CATEGORY_COUNT = 17;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8088').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ausgegeben-rules',
    firestore: { rules: readFileSync(resolve(process.cwd(), '../firestore.rules'), 'utf8'), host, port: Number(port) },
  });
}, 30_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

const category = (i: number, type = 'expense') => ({
  name: `C${i}`, iconName: 'x', colorInt: 1, transactionType: type, sortOrder: i, updatedAt: 1000, id: `c${i}`,
});
const expenses = Array.from({ length: CATEGORY_COUNT * 2 }, (_, i) => ({
  id: `e${i}`, amount: 1.5, dateMillis: Date.UTC(2025, 1, 1), categoryId: `c${i % CATEGORY_COUNT}`,
  note: '', transactionType: 'expense',
}));

function writeExpenses(db: Firestore, rows: typeof expenses) {
  const batch = writeBatch(db);
  for (const e of rows) {
    batch.set(doc(db, `users/${UID}/expenses/${e.id}`), { ...e, updatedAt: Date.now() }, { merge: true });
  }
  return batch.commit();
}

describe('restore batches', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (let i = 0; i < CATEGORY_COUNT; i++) await setDoc(doc(db, `users/${UID}/categories/c${i}`), category(i));
      for (const e of expenses) await setDoc(doc(db, `users/${UID}/expenses/${e.id}`), { ...e, updatedAt: 1000 });
    });
  });

  it('refuses one batch that spans every category', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    await assertFails(writeExpenses(db, expenses));
  });

  it('accepts the same rows split by chunkByCategory', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    for (const chunk of chunkByCategory(expenses, 400)) await assertSucceeds(writeExpenses(db, chunk));
  });

  it('accepts a category batch spanning every category, budgets checked included', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    const batch = writeBatch(db);
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      batch.set(doc(db, `users/${UID}/categories/c${i}`), category(i), { merge: true });
    }
    await assertSucceeds(batch.commit());
  });
});
