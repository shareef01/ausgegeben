import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  rulesEnv,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository, UNCATEGORIZED_ID } = await import('@/repositories/expenseRepository');

const VANISHED = 'category-that-no-longer-exists';

function expCol(db: ReturnType<typeof enforcedFirestore>) {
  return collection(db, 'users', TEST_UID, 'expenses');
}

function healthyExpense(id: string) {
  return {
    id,
    amount: 10,
    dateMillis: Date.UTC(2026, 5, 15),
    categoryId: VANISHED,
    note: 'healthy orphan',
    transactionType: 'expense',
    updatedAt: Date.now(),
  };
}

/**
 * Shaped like a row written before the field allowlist existed. validExpense uses
 * hasOnly, so the extra key makes any update of this document fail the rules —
 * including the repair sweep's own categoryId update.
 */
function legacyExpense(id: string) {
  return { ...healthyExpense(id), note: 'legacy orphan', legacyField: 'written by an old build' };
}

async function seed(healthy: number, legacy: number): Promise<void> {
  await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${TEST_UID}/categories/keep`), {
      id: 'keep',
      name: 'Groceries',
      iconName: 'shopping_cart',
      colorInt: -2345678,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: Date.now(),
    });
    for (let i = 0; i < healthy; i++) {
      await setDoc(doc(db, `users/${TEST_UID}/expenses/healthy-${i}`), healthyExpense(`healthy-${i}`));
    }
    for (let i = 0; i < legacy; i++) {
      await setDoc(doc(db, `users/${TEST_UID}/expenses/legacy-${i}`), legacyExpense(`legacy-${i}`));
    }
  });
}

async function repairedCount(): Promise<number> {
  const snap = await getDocs(expCol(enforcedFirestore()));
  return snap.docs.filter((d) => d.data().categoryId === UNCATEGORIZED_ID).length;
}

beforeAll(startEnforcedHarness, 60_000);
afterAll(stopEnforcedHarness);
beforeEach(resetEnforcedHarness);

describe('orphan repair under enforced rules', () => {
  it('repairs healthy orphans when every document is well formed', async () => {
    await seed(3, 0);

    await expenseRepository.deduplicateCategories();

    expect(await repairedCount()).toBe(3);
  });

  /**
   * The regression this file was written to catch. A Firestore batch commits all or
   * nothing, so before reassignExpenses grew its per-document fallback a single
   * rules-rejected row aborted the commit and left every healthy orphan in the same
   * chunk broken — measured at the time as 0 of 3 repaired, with the call rejecting.
   * The sweep runs once per account, so those rows stayed broken indefinitely.
   */
  it('repairs healthy orphans even when one document is rejected', async () => {
    await seed(3, 1);

    await expect(expenseRepository.deduplicateCategories()).resolves.toBeUndefined();

    expect(await repairedCount()).toBe(3);
  });

  it('leaves the rejected document alone rather than failing the sweep', async () => {
    await seed(3, 1);

    await expenseRepository.deduplicateCategories();

    const snap = await getDocs(expCol(enforcedFirestore()));
    expect(snap.docs.find((d) => d.id === 'legacy-0')?.data().categoryId).toBe(VANISHED);
  });

  /**
   * An unrepairable row must not keep the sweep un-recorded, or every cold start
   * re-reads the whole expenses collection chasing a repair that cannot succeed.
   */
  it('records the sweep even when something could not be repaired', async () => {
    await seed(3, 1);

    await expenseRepository.deduplicateCategories();

    const marker = await getDoc(doc(enforcedFirestore(), `users/${TEST_UID}/meta/dedupe`));
    expect(typeof marker.data()?.orphansScannedAt).toBe('number');
  });

  /**
   * deleteCategory committed every linked expense in one batch with no chunking, so
   * a category with more transactions than the 500-write cap failed outright.
   */
  it('deletes a category linked to more expenses than fit in one batch', async () => {
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `users/${TEST_UID}/categories/big`), {
        id: 'big',
        name: 'Busy',
        iconName: 'shopping_cart',
        colorInt: -2345678,
        transactionType: 'expense',
        sortOrder: 0,
        updatedAt: Date.now(),
      });
      for (let i = 0; i < 520; i++) {
        await setDoc(doc(db, `users/${TEST_UID}/expenses/big-${i}`), {
          ...healthyExpense(`big-${i}`),
          categoryId: 'big',
        });
      }
    });

    await expect(expenseRepository.deleteCategory('big')).resolves.toBeUndefined();

    expect(await repairedCount()).toBe(520);
  });
});
