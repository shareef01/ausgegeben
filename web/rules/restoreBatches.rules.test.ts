import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chunkByBudgetCheck, chunkByCategory } from '../src/utils/restoreBatches';

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

/**
 * AUD-001. The previous test only ever used `transactionType: 'expense'`, which makes the
 * update rule short-circuit at firestore.rules:568 before it reaches
 * `existsAfter(categoryBudgets/{id})`. These tests use income/transfer categories, which do
 * reach it, and pin the measured ceiling: a batch may spend 20 document accesses in total,
 * one of which the shared `meta/accountDeletion` read takes — so 19 checked rows pass and
 * 20 fail.
 */
describe('restore batches: non-expense categories spend access budget', () => {
  const OTHER = 30;
  const incomeCategory = (i: number) => ({ ...category(i, 'income'), updatedAt: 1000 });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (let i = 0; i < OTHER; i++) {
        await setDoc(doc(db, `users/${UID}/categories/c${i}`), incomeCategory(i));
        // Separate ids: rewriting an income row as a transfer is a *type change*, which the
        // rules refuse on its own (validCategoryUpdate), and would mask the budget.
        await setDoc(doc(db, `users/${UID}/categories/t${i}`), { ...category(i, 'transfer'), updatedAt: 1000 });
      }
    });
  });

  function writeIncomeCategories(db: Firestore, n: number, extra?: (batch: ReturnType<typeof writeBatch>) => void) {
    const batch = writeBatch(db);
    for (let i = 0; i < n; i++) {
      batch.set(doc(db, `users/${UID}/categories/c${i}`), { ...incomeCategory(i), updatedAt: Date.now() }, { merge: true });
    }
    extra?.(batch);
    return batch.commit();
  }

  it('accepts 19 income category updates and refuses 20', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    await assertSucceeds(writeIncomeCategories(db, 19));
    await assertFails(writeIncomeCategories(db, 20));
  });

  it('accepts transfer categories under the same ceiling', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    const write = (n: number) => {
      const batch = writeBatch(db);
      for (let i = 0; i < n; i++) {
        batch.set(
          doc(db, `users/${UID}/categories/t${i}`),
          { ...category(i, 'transfer'), updatedAt: Date.now() },
          { merge: true },
        );
      }
      return batch.commit();
    };
    await assertSucceeds(write(19));
    await assertFails(write(20));
  });

  it('the restore-journal lease update in the same batch costs no document access', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    const opRef = doc(db, `users/${UID}/meta/restoreOperation`);
    await assertSucceeds(
      setDoc(opRef, {
        operationId: 'op-1',
        ownerUid: UID,
        mode: 'replace',
        backupFingerprint: 'fingerprint',
        phase: 'COMPLETED',
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const withJournal = (batch: ReturnType<typeof writeBatch>) =>
      batch.update(opRef, { updatedAt: Date.now(), progress: { leaseHolder: 'holder', fencingToken: 3 } });

    // Identical boundary with the journal update in the batch: 19 pass, 20 fail.
    await assertSucceeds(writeIncomeCategories(db, 19, withJournal));
    await assertFails(writeIncomeCategories(db, 20, withJournal));
  });

  it('chunkByBudgetCheck keeps every batch inside the measured ceiling', async () => {
    const db = testEnv.authenticatedContext(UID, { email_verified: true }).firestore();
    const rows = Array.from({ length: OTHER }, (_, i) => ({ id: `c${i}` }));
    const chunks = chunkByBudgetCheck(rows, 400, undefined, () => true);
    expect(chunks.every((c) => c.length <= 19)).toBe(true);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const row of chunk) {
        const i = Number(row.id.slice(1));
        batch.set(doc(db, `users/${UID}/categories/${row.id}`), { ...incomeCategory(i), updatedAt: Date.now() }, { merge: true });
      }
      await assertSucceeds(batch.commit());
    }
  });
});
