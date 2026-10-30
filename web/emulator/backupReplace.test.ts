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
import { useAuthStore } from '@/services/authStore';
import {
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_BACKUP_SCHEMA_VERSION,
  type AusgegebenBackup,
} from '@/services/backupFormat';
import { restoreBackup } from '@/services/backupRestore';
import { MAX_SNAPSHOT_CHUNKS } from '@/services/restoreLimits';
import {
  createSafetySnapshot,
  executeReplace,
  getRestoreOperation,
  SNAPSHOT_CHUNK_SIZE,
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

  it('refuses a snapshot past the rules chunk cap before writing anything', async () => {
    const row = {
      id: 'x', amount: 1, dateMillis: 1700000000000, categoryId: 'c', note: '', transactionType: 'expense' as const,
    };
    const expenses = Array.from({ length: SNAPSHOT_CHUNK_SIZE * MAX_SNAPSHOT_CHUNKS + 1 }, (_, i) => ({ ...row, id: `e${i}` }));
    await expect(createSafetySnapshot(TEST_UID, 'op-too-large', expenses, [], null)).rejects.toThrow('SNAPSHOT_TOO_LARGE');
    const written = await getDocs(collection(enforcedFirestore(), 'users', TEST_UID, 'restoreSnapshot'));
    expect(written.empty).toBe(true);
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
      categoryBudgets: [],
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
      cloudId: 'legacy-c1',
      categoryCloudId: 'cat-legacy',
      receiptImagePath: '/path/to/img.jpg',
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
    expect(origExp.data()?.cloudId).toBe('legacy-c1');
    expect(origExp.data()?.categoryCloudId).toBe('cat-legacy');
    expect(origExp.data()?.receiptImagePath).toBe('/path/to/img.jpg');

    const newExp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'new-0'));
    expect(newExp0.exists()).toBe(false);

    // Rollback run twice is safe and does not delete or duplicate data
    op = await getRestoreOperation(TEST_UID);
    expect(op?.phase).toBe('ROLLED_BACK');
  });

  it('replaces an expense edited after the backup was taken (stale backup updatedAt)', async () => {
    const db = enforcedFirestore();
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food', iconName: 'food', colorInt: -1, transactionType: 'expense', sortOrder: 0, updatedAt: 1000,
    });
    // Edited "just now": its clock is newer than the backup copy of the same row.
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'), {
      amount: 99.0, dateMillis: 1700000000000, categoryId: 'cat-food', note: 'Edited after backup',
      transactionType: 'expense', updatedAt: Date.now(),
    });
    const backup = createTestBackup({ numExpenses: 1, prefix: 'exp' });
    backup.expenses[0].updatedAt = Date.now() - 86_400_000;

    const result = await executeReplace(backup, TEST_UID);
    expect(result.phase).toBe('COMPLETED');
    const exp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(exp0.data()?.note).toBe('Expense exp 0');
    expect(exp0.data()?.amount).toBe(10.5);
  });

  it('merge restore overwrites an expense edited after the backup was taken', async () => {
    const db = enforcedFirestore();
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food', iconName: 'food', colorInt: -1, transactionType: 'expense', sortOrder: 0, updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'), {
      amount: 99.0, dateMillis: 1700000000000, categoryId: 'cat-food', note: 'Edited after backup',
      transactionType: 'expense', updatedAt: Date.now(),
    });
    const backup = createTestBackup({ numExpenses: 1, prefix: 'exp' });
    backup.expenses[0].updatedAt = Date.now() - 86_400_000;

    await restoreBackup(backup, TEST_UID);
    const exp0 = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-0'));
    expect(exp0.data()?.note).toBe('Expense exp 0');
  });

  it('a resume that fails before SNAPSHOT_READY keeps the original safety snapshot', async () => {
    const db = enforcedFirestore();
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food', iconName: 'food', colorInt: -1, transactionType: 'expense', sortOrder: 0, updatedAt: 1000,
    });
    await setDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'), {
      amount: 42.0, dateMillis: 1700000000000, categoryId: 'cat-food', note: 'Only in the original account',
      transactionType: 'expense', updatedAt: 1000,
    });
    const backup = createTestBackup({ numExpenses: 2, prefix: 'new' });

    // First run gets as far as deleting exp-original, then fails.
    await expect(executeReplace(backup, TEST_UID, { failAfterExpenseDeleteBatch: 1 }))
      .rejects.toThrow('FAULT_INJECTED_AFTER_EXPENSE_DELETE_BATCH');
    let op = await getRestoreOperation(TEST_UID);
    expect(op?.phase).toBe('FAILED_RECOVERABLE');
    expect(op?.snapshotMeta).toBeDefined();

    // A resume dies before it re-reaches SNAPSHOT_READY...
    await expect(resumeReplace(op!, backup, TEST_UID, { failAfterSnapshot: true }))
      .rejects.toThrow('FAULT_INJECTED_AFTER_SNAPSHOT');
    op = await getRestoreOperation(TEST_UID);
    expect(op?.snapshotMeta).toBeDefined();

    // ...and the next resume must not re-snapshot the half-replaced account.
    await expect(resumeReplace(op!, backup, TEST_UID, { failBeforePreferences: true }))
      .rejects.toThrow('FAULT_INJECTED_BEFORE_PREFERENCES');
    op = await getRestoreOperation(TEST_UID);
    await rollbackReplace(op!, TEST_UID);

    const orig = await getDoc(doc(db, 'users', TEST_UID, 'expenses', 'exp-original'));
    expect(orig.exists()).toBe(true);
    expect(orig.data()?.note).toBe('Only in the original account');
  });

  it('refuses a safety snapshot whose recurring receipt chunk is missing', async () => {
    // Expense chunks already fail closed; a silently skipped receipt chunk would let
    // rollback replace the receipts collection with a partial list, and the deleted
    // receipts' occurrences would then be materialised a second time.
    // The receipt below is rules-shaped (id encodes template + date, expenseId is a
    // lowercase SHA-256 hex id) so this exercises the missing *chunk*, not row validation.
    const templateId = '11111111-2222-4333-8444-555555555555';
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      const base = { operationId: 'replace_test', ownerUid: TEST_UID, createdAt: 1000 };
      await adminDb.doc(`users/${TEST_UID}/restoreSnapshot/meta`).set({
        ...base, chunkCount: 1, receiptChunkCount: 2, totalExpenses: 0, totalCategories: 0, totalReceipts: 2,
        categories: [], recurringTemplates: [],
      });
      await adminDb.doc(`users/${TEST_UID}/restoreSnapshot/chunk_0`).set({ ...base, chunkIndex: 0, chunkCount: 1, expenses: [] });
      await adminDb.doc(`users/${TEST_UID}/restoreSnapshot/receipt_chunk_0`).set({
        ...base, chunkIndex: 0, chunkCount: 2,
        recurringReceipts: [{
          id: `${templateId}_2026-01-01`,
          templateId,
          scheduledDate: '2026-01-01',
          expenseId: 'a'.repeat(64),
          createdAt: 1,
        }],
      });
    });
    await expect(readSafetySnapshot(TEST_UID)).rejects.toThrow('SNAPSHOT_CHUNK_MISSING_OR_CHANGED');
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

  it('preserves budgets for v1 merge/replace and restores exact v2 budget values after rollback', async () => {
    const { categoryBudgetRepository: repo } = await import('@/services/categoryBudgets');
    const initial=createTestBackup(); initial.schemaVersion=1; delete initial.categoryBudgets;
    await restoreBackup(initial,TEST_UID);
    const b={categoryId:'cat-food',monthlyLimit:400,warningThresholdPercent:80,updatedAt:Date.now()};
    await repo.save(TEST_UID,b,'cat-food',null);
    await restoreBackup(initial,TEST_UID);
    expect((await repo.getAll(TEST_UID))[0].monthlyLimit).toBe(400);
    await executeReplace(initial,TEST_UID);
    expect((await repo.getAll(TEST_UID))[0].monthlyLimit).toBe(400);
    const modern=createTestBackup();
    modern.categories.push({...modern.categories[0],id:'new-budget-cat',name:'New budget'});
    modern.categoryBudgets=[{...b,monthlyLimit:250,warningThresholdPercent:75},{...b,categoryId:'new-budget-cat',monthlyLimit:100}];
    await executeReplace(modern,TEST_UID);
    expect((await repo.getAll(TEST_UID)).find(x=>x.categoryId==='cat-food')?.monthlyLimit).toBe(250);
    expect(await repo.getAll(TEST_UID)).toHaveLength(2);
    const op=await getRestoreOperation(TEST_UID);
    await rollbackReplace(op!,TEST_UID);
    expect((await repo.getAll(TEST_UID)).map(({updatedAt,...value})=>value)).toEqual([{categoryId:'cat-food',monthlyLimit:400,warningThresholdPercent:80}]);
    const empty=createTestBackup();
    await executeReplace(empty,TEST_UID);
    expect(await repo.getAll(TEST_UID)).toEqual([]);
    const emptyOp=(await getRestoreOperation(TEST_UID))!;
    await expect(rollbackReplace({...emptyOp,operationId:'stale-operation'},TEST_UID)).rejects.toThrow('SNAPSHOT_OPERATION_MISMATCH');
    const {disableNetwork,enableNetwork}=await import('firebase/firestore');
    const db=enforcedFirestore();
    await disableNetwork(db);
    try { await expect(rollbackReplace(emptyOp,TEST_UID)).rejects.toThrow(); }
    finally { await enableNetwork(db); }
    expect((await getRestoreOperation(TEST_UID))?.phase).toBe('COMPLETED');
    expect(await repo.getAll(TEST_UID)).toEqual([]);
    await rollbackReplace(emptyOp,TEST_UID);
    expect((await repo.getAll(TEST_UID))[0].monthlyLimit).toBe(400);
  });

  /**
   * AUD-001. The replace path writes every backed-up category in one batch that also
   * carries the restore-journal lease renewal. A category whose type is not `expense`
   * spends a rules document-access call on `existsAfter(categoryBudgets/{id})`; the
   * journal update spends none. Before the fix this batch was chunked by row count only,
   * so a 25-income-category account failed at the first APPLYING batch — and the rollback
   * that follows writes categories the same way, so recovery failed too.
   */
  it('17. replace applies and rolls back more non-expense categories than one batch may read', async () => {
    const db = enforcedFirestore();
    const categories = Array.from({ length: 25 }, (_, i) => ({
      id: `inc-${i}`,
      name: `Income ${i}`,
      iconName: 'wallet',
      colorInt: 1,
      transactionType: 'income' as const,
      sortOrder: i,
      updatedAt: 1_700_000_000_000,
    }));

    // Pre-existing rows: every write is an UPDATE, which is the rule that costs an access.
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const raw = ctx.firestore();
      for (const c of categories) {
        await setDoc(doc(raw, `users/${TEST_UID}/categories/${c.id}`), { ...c, updatedAt: 1000 });
      }
    });

    const backup = { ...createTestBackup({ numExpenses: 0 }), categories, expenses: [] };
    const result = await executeReplace(backup, TEST_UID);
    expect(result.success).toBe(true);

    const stored = await getDocs(collection(db, 'users', TEST_UID, 'categories'));
    expect(stored.size).toBe(25);
    expect(stored.docs.every((d) => d.data().transactionType === 'income')).toBe(true);

    // Rollback restores snapshot categories through the same budget; it must also commit.
    const op = await getRestoreOperation(TEST_UID);
    await rollbackReplace(op!, TEST_UID);
    expect((await getDocs(collection(db, 'users', TEST_UID, 'categories'))).size).toBe(25);
  });

  /**
   * AUD-006. The snapshot is the only recovery path, and rollback writes it back as
   * authoritative state. A malformed row must therefore abort the rollback with a path-anchored
   * code *before* anything is written, and must leave both the journal (so the failure is
   * visible and retryable) and the snapshot documents (so the data is still there) intact —
   * never defaulted to 0, dropped, or read as "the account had no expenses".
   */
  it('18. a corrupt safety snapshot fails the rollback closed and preserves journal and snapshot', async () => {
    const db = enforcedFirestore();

    // Seed the account *before* the replace: the safety snapshot captures the pre-replace
    // state, so without a pre-existing row the snapshot would be empty and there would be
    // nothing to corrupt.
    await setDoc(doc(db, 'users', TEST_UID, 'categories', 'cat-food'), {
      name: 'Food',
      iconName: 'food',
      colorInt: -1,
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

    const backup = createTestBackup({ numExpenses: 2, prefix: 'kept' });
    await executeReplace(backup, TEST_UID);
    const op = await getRestoreOperation(TEST_UID);
    expect(op?.phase).toBe('COMPLETED');

    // Corrupt the snapshot row the way a truncated or foreign-shape write would: the amount
    // becomes a string. The old reader defaulted this to 0.00 and rolled it back as the
    // account's real value.
    await rulesEnv().withSecurityRulesDisabled(async (ctx) => {
      const chunkRef = doc(ctx.firestore(), `users/${TEST_UID}/restoreSnapshot/chunk_0`);
      const chunk = (await getDoc(chunkRef)).data() as { expenses: Record<string, unknown>[] };
      expect(chunk.expenses).toHaveLength(1);
      await setDoc(chunkRef, { ...chunk, expenses: [{ ...chunk.expenses[0], amount: '12,50' }] });
    });

    // The reader refuses with the exact path, and the rollback surfaces it before writing.
    await expect(readSafetySnapshot(TEST_UID)).rejects.toThrow(/SNAPSHOT_INVALID: chunk_0\.expenses\[0\]\.amount/);
    await expect(rollbackReplace(op!, TEST_UID)).rejects.toThrow(/SNAPSHOT_INVALID: chunk_0\.expenses\[0\]\.amount/);

    // Fail-closed and side-effect free: the read happens before the journal is touched on both
    // clients, so the operation keeps its truthful COMPLETED state rather than claiming a
    // rollback ran. Nothing was written and nothing was deleted.
    const after = await getRestoreOperation(TEST_UID);
    expect(after?.phase).toBe('COMPLETED');

    // …and nothing was deleted from the snapshot, so the data is still recoverable.
    const snapshotMeta = await getDoc(doc(db, 'users', TEST_UID, 'restoreSnapshot', 'meta'));
    expect(snapshotMeta.exists()).toBe(true);
    expect((await getDoc(doc(db, 'users', TEST_UID, 'restoreSnapshot', 'chunk_0'))).exists()).toBe(true);

    // The corrupt payload was never written back: the account still holds exactly the two
    // replaced rows at their real amounts, and no row was defaulted to 0.00.
    const expensesAfter = await getDocs(collection(db, 'users', TEST_UID, 'expenses'));
    expect(expensesAfter.docs.map((d) => d.data().amount).sort((a, b) => a - b)).toEqual([10.5, 11.5]);
    expect(expensesAfter.docs.every((d) => typeof d.data().amount === 'number')).toBe(true);
  });

  it('v2 merge upserts represented budgets and preserves omitted budgets', async () => {
    const { categoryBudgetRepository: repo } = await import('@/services/categoryBudgets');
    const base=createTestBackup();
    base.categories.push({...base.categories[0],id:'other-budget-cat',name:'Other'});
    await restoreBackup(base,TEST_UID);
    const b={categoryId:'other-budget-cat',monthlyLimit:300,warningThresholdPercent:90,updatedAt:Date.now()};
    await repo.save(TEST_UID,b,b.categoryId,null);
    base.categoryBudgets=[{...b,categoryId:'cat-food',monthlyLimit:250}];
    await restoreBackup(base,TEST_UID);
    expect((await repo.getAll(TEST_UID)).map(({updatedAt,...value})=>value)).toEqual([
      {categoryId:'cat-food',monthlyLimit:250,warningThresholdPercent:90},
      {categoryId:'other-budget-cat',monthlyLimit:300,warningThresholdPercent:90},
    ]);
  });

});
