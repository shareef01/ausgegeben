import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  enforcedFirestore,
  resetEnforcedHarness,
  startEnforcedHarness,
  stopEnforcedHarness,
  TEST_UID,
} from './enforcedHarness';
import { useAuthStore } from '@/services/authStore';
import {
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_BACKUP_SCHEMA_VERSION,
  type AusgegebenBackup,
} from '@/services/backupFormat';
import { restoreBackup } from '@/services/backupRestore';
import {
  executeReplace,
  getRestoreOperation,
  resumeReplace,
  rollbackReplace,
  readSafetySnapshot,
} from '@/services/backupReplace';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { enforcedFirestore: db } = await import('./enforcedHarness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

describe('backupReplace on real Firestore emulator with rules enforced', () => {
  beforeAll(async () => {
    await startEnforcedHarness();
  });

  afterAll(async () => {
    await stopEnforcedHarness();
  });

  beforeEach(async () => {
    await resetEnforcedHarness();
    useAuthStore.setState({
      user: {
        uid: TEST_UID,
        email: 'enforced-test@example.com',
        displayName: null,
        emailVerified: true,
      },
    });
  });

  function createTestBackup(params?: {
    numExpenses?: number;
    prefix?: string;
    catId?: string;
    catName?: string;
    currency?: string;
  }): AusgegebenBackup {
    const num = params?.numExpenses ?? 2;
    const prefix = params?.prefix ?? 'exp';
    const catId = params?.catId ?? 'cat-food';
    const catName = params?.catName ?? 'Food & Dining';
    const currency = params?.currency ?? 'EUR';

    const expenses = [];
    for (let i = 0; i < num; i++) {
      expenses.push({
        id: `${prefix}-${i}`,
        amount: 10.5 + i,
        dateMillis: 1700000000000 + i * 1000,
        categoryId: catId,
        note: `Expense ${prefix} ${i}`,
        transactionType: 'expense' as const,
      });
    }

    return {
      format: BACKUP_FORMAT_IDENTIFIER,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-10-01T00:00:00.000Z',
      appVersion: '2.0.8',
      preferences: {
        currency,
        monthlyBudget: 750,
        locale: 'en',
        themeMode: 'system',
      },
      categories: [
        {
          id: catId,
          name: catName,
          iconName: 'restaurant',
          colorInt: -16711936,
          transactionType: 'expense',
          sortOrder: 0,
        },
      ],
      expenses,
    };
  }

  it('1. successful replace and 4. matching IDs updated correctly', async () => {
    const db = enforcedFirestore();

    // Seed existing server records
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Old Food',
      iconName: 'food',
      colorInt: -1,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'), {
      amount: 5.0,
      dateMillis: 1700000000000,
      categoryId: 'cat-food',
      note: 'Old note',
      transactionType: 'expense',
      updatedAt: 1000,
    });

    const backup = createTestBackup({ numExpenses: 2, prefix: 'exp' });
    const result = await executeReplace(backup, TEST_UID);

    expect(result.success).toBe(true);
    expect(result.phase).toBe('COMPLETED');

    // Matching ID exp-0 is updated
    const exp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(exp0.exists()).toBe(true);
    expect(exp0.data()?.amount).toBe(10.5);
    expect(exp0.data()?.note).toBe('Expense exp 0');

    // New ID exp-1 is added
    const exp1 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-1'));
    expect(exp1.exists()).toBe(true);
  });

  it('2. same-state replace runs idempotently without duplicating', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup({ numExpenses: 2 });

    await executeReplace(backup, TEST_UID);
    await executeReplace(backup, TEST_UID);

    const allExpenses = await getDocs(collection(db, 'users', TEST_UID, 'expenses'));
    expect(allExpenses.size).toBe(2);

    const allCats = await getDocs(collection(db, 'users', TEST_UID, 'categories'));
    expect(allCats.size).toBe(1);
  });

  it('3. replace deletes current records absent from backup while preserving unrelated categories', async () => {
    const db = enforcedFirestore();

    // Pre-seed an unrelated expense and category
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-old'), {
      name: 'Old Category',
      iconName: 'old',
      colorInt: -2,
      transactionType: 'expense',
      sortOrder: 1,
      updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-stale'), {
      amount: 99.0,
      dateMillis: 1700000000000,
      categoryId: 'cat-old',
      note: 'Stale expense',
      transactionType: 'expense',
      updatedAt: 1000,
    });

    // Replace with backup that does NOT have exp-stale or cat-old
    const backup = createTestBackup({ numExpenses: 1, prefix: 'new-exp' });
    await executeReplace(backup, TEST_UID);

    // Stale expense was deleted
    const staleExp = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-stale'));
    expect(staleExp.exists()).toBe(false);

    // New expense exists
    const newExp = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'new-exp-0'));
    expect(newExp.exists()).toBe(true);

    // Unrelated category is preserved (safe from breaking references)
    const oldCat = await getDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-old'));
    expect(oldCat.exists()).toBe(true);
  });

  it('5. unrelated internal collections remain untouched', async () => {
    const db = enforcedFirestore();

    // Pre-seed dedupe marker in meta/dedupe
    await setDoc(doc(db, 'users', TEST_UID, 'meta', 'dedupe'), {
      categoriesDeduped: true,
      ranAt: Date.now(),
    });

    const backup = createTestBackup({ numExpenses: 1 });
    await executeReplace(backup, TEST_UID);

    const dedupeDoc = await getDoc(doc(db, 'users', TEST_UID, 'meta', 'dedupe'));
    expect(dedupeDoc.exists()).toBe(true);
    expect(dedupeDoc.data()?.categoriesDeduped).toBe(true);
  });

  it('6. category references remain valid and category type conflict is rejected', async () => {
    const db = enforcedFirestore();

    // Pre-seed cat-food as income
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food',
      iconName: 'food',
      colorInt: -1,
      transactionType: 'income',
      sortOrder: 0,
      updatedAt: 1000,
    });

    const backup = createTestBackup({ numExpenses: 1, catId: 'cat-food' }); // backup has expense type
    await expect(executeReplace(backup, TEST_UID)).rejects.toThrow('REPLACE_PLAN_CONFLICTS');

    // No writes committed
    const op = await getRestoreOperation(TEST_UID);
    expect(op).toBeNull();
  });

  it('8. fault injection: failure after first destructive batch and 9. resume completes correctly', async () => {
    const db = enforcedFirestore();

    // Pre-seed initial state
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food',
      iconName: 'food',
      colorInt: -1,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'), {
      amount: 1.0,
      dateMillis: 1700000000000,
      categoryId: 'cat-food',
      note: 'Original',
      transactionType: 'expense',
      updatedAt: 1000,
    });

    const backup = createTestBackup({ numExpenses: 2, prefix: 'exp' });

    // Force failure after category batch
    await expect(
      executeReplace(backup, TEST_UID, { failAfterCategoryBatch: 1 }),
    ).rejects.toThrow('FAULT_INJECTED_AFTER_CATEGORY_BATCH');

    // Journal records FAILED_RECOVERABLE
    const op = await getRestoreOperation(TEST_UID);
    expect(op).not.toBeNull();
    expect(op?.phase).toBe('FAILED_RECOVERABLE');

    // Snapshot was preserved
    const snapshot = await readSafetySnapshot(TEST_UID);
    expect(snapshot.expenses.length).toBe(1);
    expect(snapshot.expenses[0].id).toBe('exp-original');

    // Now resume replacement
    const resumedResult = await resumeReplace(op!, backup, TEST_UID);
    expect(resumedResult.success).toBe(true);
    expect(resumedResult.phase).toBe('COMPLETED');

    // Final state matches backup: exp-0 and exp-1 exist, exp-original is deleted
    const exp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    const exp1 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-1'));
    const expOrig = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'));

    expect(exp0.exists()).toBe(true);
    expect(exp1.exists()).toBe(true);
    expect(expOrig.exists()).toBe(false);
  });

  it('10. rollback restores original state, 11. can resume after interruption, and 12. rollback run twice is safe', async () => {
    const db = enforcedFirestore();

    // Pre-seed original account state
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Original Food',
      iconName: 'food',
      colorInt: -100,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'), {
      amount: 42.0,
      dateMillis: 1700000000000,
      categoryId: 'cat-food',
      note: 'Crucial original expense',
      transactionType: 'expense',
      updatedAt: 1000,
    });

    const backup = createTestBackup({ numExpenses: 2, prefix: 'new' });

    // Inject failure after expense upsert
    await expect(
      executeReplace(backup, TEST_UID, { failAfterExpenseUpsertBatch: 1 }),
    ).rejects.toThrow('FAULT_INJECTED_AFTER_EXPENSE_UPSERT_BATCH');

    let op = await getRestoreOperation(TEST_UID);
    expect(op?.phase).toBe('FAILED_RECOVERABLE');

    // Test interrupted rollback: inject failure during rollback
    await expect(
      rollbackReplace(op!, TEST_UID, { failDuringRollback: true }),
    ).rejects.toThrow('FAULT_INJECTED_DURING_ROLLBACK');

    // Re-fetch op and run rollback again to completion (idempotent rollback resume)
    op = await getRestoreOperation(TEST_UID);
    await rollbackReplace(op!, TEST_UID);

    // Verify rollback fully restored original expense and removed the partial backup expenses
    const origExp = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'));
    expect(origExp.exists()).toBe(true);
    expect(origExp.data()?.amount).toBe(42.0);

    const newExp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'new-0'));
    expect(newExp0.exists()).toBe(false);

    // Rollback run twice is safe and does not delete or duplicate data
    op = await getRestoreOperation(TEST_UID);
    expect(op?.phase).toBe('ROLLED_BACK');
  });

  it('13. account switch blocks continuation', async () => {
    const backup = createTestBackup({ numExpenses: 1 });
    await expect(executeReplace(backup, 'other-uid')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
  });

  it('15. >400 documents crosses a write-batch boundary', async () => {
    const db = enforcedFirestore();
    const backup = createTestBackup({ numExpenses: 450, prefix: 'bulk' });

    const result = await executeReplace(backup, TEST_UID);
    expect(result.success).toBe(true);

    const allExpenses = await getDocs(collection(db, 'users', TEST_UID, 'expenses'));
    expect(allExpenses.size).toBe(450);
  });

  it('16. existing merge restore semantics remain unchanged and non-destructive', async () => {
    const db = enforcedFirestore();

    // Pre-seed an unrelated expense
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food',
      iconName: 'food',
      colorInt: -1,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'unrelated-exp'), {
      amount: 99.0,
      dateMillis: 1700000000000,
      categoryId: 'cat-food',
      note: 'Must stay in merge restore',
      transactionType: 'expense',
      updatedAt: 1000,
    });

    const backup = createTestBackup({ numExpenses: 1, prefix: 'merge-exp' });

    // Run ordinary merge restore
    const mergeResult = await restoreBackup(backup, TEST_UID);
    expect(mergeResult.success).toBe(true);

    // Verify unrelated expense was preserved by merge restore
    const unrelatedSnap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'unrelated-exp'));
    expect(unrelatedSnap.exists()).toBe(true);

    // Verify merge expense was added
    const mergeSnap = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'merge-exp-0'));
    expect(mergeSnap.exists()).toBe(true);
  });
});
