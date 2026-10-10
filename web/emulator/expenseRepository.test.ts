import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, updateDoc, deleteDoc, disableNetwork, enableNetwork } from 'firebase/firestore';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  signOutTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

// Point the repository's Firestore accessor at the emulator instance. Imported
// lazily inside the factory because vi.mock is hoisted above the imports above.
vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository, UNCATEGORIZED_ID } = await import('@/repositories/expenseRepository');

type CategorySeed = {
  id: string;
  name: string;
  transactionType?: 'expense' | 'income' | 'transfer';
  sortOrder?: number;
};

function catCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'categories');
}

function expCol() {
  return collection(emulatorFirestore(), 'users', TEST_UID, 'expenses');
}

async function seedCategory({
  id,
  name,
  transactionType = 'expense',
  sortOrder = 0,
}: CategorySeed): Promise<void> {
  await setDoc(doc(catCol(), id), {
    id,
    name,
    iconName: 'shopping_cart',
    colorInt: -2345678,
    transactionType,
    sortOrder,
    updatedAt: Date.now(),
  });
}

async function seedExpense(id: string, categoryId: string, amount = 10): Promise<void> {
  await setDoc(doc(expCol(), id), {
    id,
    amount,
    dateMillis: Date.UTC(2026, 5, 15),
    categoryId,
    note: 'seeded',
    transactionType: 'expense',
    updatedAt: Date.now(),
  });
}

async function categoryIds(): Promise<string[]> {
  return (await getDocs(catCol())).docs.map((d) => d.id).sort();
}

async function categoryIdOf(expenseId: string): Promise<string | undefined> {
  const snap = await getDoc(doc(expCol(), expenseId));
  return snap.data()?.categoryId as string | undefined;
}

async function transactionTypeOf(expenseId: string): Promise<string | undefined> {
  const snap = await getDoc(doc(expCol(), expenseId));
  return snap.data()?.transactionType as string | undefined;
}

beforeAll(startHarness, 60_000);
afterAll(stopHarness);
beforeEach(async () => {
  await resetHarness();
  signInTestUser();
});

describe('insertExpense', () => {
  const draft = {
    amount: 12.345,
    dateMillis: Date.UTC(2026, 5, 15),
    categoryId: 'cat-1',
    note: '  coffee  ',
    transactionType: 'expense' as const,
  };

  beforeEach(async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
  });

  it('rounds the amount and trims the note', async () => {
    const id = await expenseRepository.insertExpense(draft);

    const saved = (await getDoc(doc(expCol(), id))).data();
    expect(saved?.amount).toBe(12.35);
    expect(saved?.note).toBe('coffee');
  });

  // The whole point of the key: a retried save must not become a second transaction.
  it('collapses a repeated idempotency key onto one document', async () => {
    const first = await expenseRepository.insertExpense(draft, 'key-abc');
    const second = await expenseRepository.insertExpense(draft, 'key-abc');

    expect(second).toBe(first);
    expect((await getDocs(expCol())).size).toBe(1);
  });

  it('collapses 20 concurrent creates onto one deterministic document', async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => expenseRepository.insertExpense(draft, 'concurrent-key')),
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe('f09d6c23d388ea5751b33a6b8eef0c50f660571c35966f819dd47f9af63cab3a');
    expect((await getDocs(expCol())).size).toBe(1);
  });

  it('does not overwrite financial fields on a contradictory retry', async () => {
    const id = await expenseRepository.insertExpense(draft, 'conflict-key');
    await expenseRepository.insertExpense({ ...draft, amount: 999, note: 'contradiction' }, 'conflict-key');
    const saved = (await getDoc(doc(expCol(), id))).data();
    expect(saved?.amount).toBe(12.35);
    expect(saved?.note).toBe('coffee');
  });

  it('returns a legacy random-id row with the same key', async () => {
    await setDoc(doc(expCol(), 'legacy-random-id'), {
      ...draft, idempotencyKey: 'legacy-key', updatedAt: Date.now(),
    });
    await expect(expenseRepository.insertExpense(draft, 'legacy-key')).resolves.toBe('legacy-random-id');
    expect((await getDocs(expCol())).size).toBe(1);
  });

  it('treats different keys as different transactions', async () => {
    await expenseRepository.insertExpense(draft, 'key-1');
    await expenseRepository.insertExpense(draft, 'key-2');

    expect((await getDocs(expCol())).size).toBe(2);
  });

  it('saves a transaction while offline, appears locally, and syncs on reconnect', async () => {
    await disableNetwork(emulatorFirestore());
    try {
      const id = await expenseRepository.insertExpense(draft, 'offline-key-1');
      expect(id).toBeDefined();
      const local = await expenseRepository.getExpenseById(id);
      expect(local).toBeDefined();
      expect(local?.amount).toBe(12.35);
    } finally {
      await enableNetwork(emulatorFirestore());
    }
    await vi.waitFor(async () => {
      const serverDocs = await getDocs(expCol());
      expect(serverDocs.size).toBe(1);
    });
  });

  it('two submissions with the same operation id produce one document, online and offline', async () => {
    // Online
    const onlineId1 = await expenseRepository.insertExpense(draft, 'op-online-same');
    const onlineId2 = await expenseRepository.insertExpense(draft, 'op-online-same');
    expect(onlineId1).toBe(onlineId2);
    expect((await getDocs(expCol())).size).toBe(1);

    // Offline
    await disableNetwork(emulatorFirestore());
    try {
      const offlineId1 = await expenseRepository.insertExpense(draft, 'op-offline-same');
      const offlineId2 = await expenseRepository.insertExpense(draft, 'op-offline-same');
      expect(offlineId1).toBe(offlineId2);
      const local = await expenseRepository.getExpenseById(offlineId1);
      expect(local).toBeDefined();
    } finally {
      await enableNetwork(emulatorFirestore());
    }
    await vi.waitFor(async () => {
      const serverDocs = await getDocs(expCol());
      expect(serverDocs.size).toBe(2);
    });
  });

  it('creates a separate row each time when no key is supplied', async () => {
    await expenseRepository.insertExpense(draft);
    await expenseRepository.insertExpense(draft);

    expect((await getDocs(expCol())).size).toBe(2);
  });

  it('refuses to write for an unverified account', async () => {
    signInTestUser(false);

    await expect(expenseRepository.insertExpense(draft)).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect((await getDocs(expCol())).size).toBe(0);
  });

  it('throws when signed out', async () => {
    signOutTestUser();

    await expect(expenseRepository.insertExpense(draft)).rejects.toThrow('Not signed in');
  });
});

describe('deleteCategory', () => {
  it('moves linked expenses to the uncategorized sentinel before deleting', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedExpense('e1', 'cat-1');
    await seedExpense('e2', 'cat-1');

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIdOf('e1')).toBe(UNCATEGORIZED_ID);
    expect(await categoryIdOf('e2')).toBe(UNCATEGORIZED_ID);
    expect(await categoryIds()).toEqual([UNCATEGORIZED_ID]);
  });

  it('does not create the sentinel when nothing is linked', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIds()).toEqual([]);
  });

  it('leaves other categories and their expenses untouched', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedCategory({ id: 'cat-2', name: 'Transport', sortOrder: 1 });
    await seedExpense('e1', 'cat-1');
    await seedExpense('e2', 'cat-2');

    await expenseRepository.deleteCategory('cat-1');

    expect(await categoryIdOf('e2')).toBe('cat-2');
    expect(await categoryIds()).toContain('cat-2');
  });

  // Legacy Android rows stored categoryId as a number; Firestore equality is
  // type-sensitive, so a string-only query would silently miss them.
  it('finds legacy numeric categoryIds when reassigning', async () => {
    await seedCategory({ id: '7', name: 'Legacy' });
    await setDoc(doc(expCol(), 'legacy'), {
      id: 'legacy',
      amount: 5,
      dateMillis: Date.UTC(2026, 5, 15),
      categoryId: 7,
      note: 'numeric id',
      transactionType: 'expense',
      updatedAt: Date.now(),
    });

    await expenseRepository.deleteCategory('7');

    expect(await categoryIdOf('legacy')).toBe(UNCATEGORIZED_ID);
  });

  it('refuses to delete the referenced uncategorized sentinel', async () => {
    await seedCategory({ id: UNCATEGORIZED_ID, name: 'Uncategorized' });
    await seedExpense('e1', UNCATEGORIZED_ID);
    await expect(expenseRepository.deleteCategory(UNCATEGORIZED_ID)).rejects.toThrow('CATEGORY_IN_USE');
    expect(await categoryIds()).toContain(UNCATEGORIZED_ID);
    expect(await categoryIdOf('e1')).toBe(UNCATEGORIZED_ID);
    expect((await getDoc(doc(catCol(), UNCATEGORIZED_ID))).data()?.deletionState).toBeUndefined();
  });
});

describe('deduplicateCategories', () => {
  it('merges same name and type onto the lowest sortOrder and moves its expenses', async () => {
    await seedCategory({ id: 'keep', name: 'Groceries', sortOrder: 0 });
    await seedCategory({ id: 'dup', name: 'groceries', sortOrder: 5 });
    await seedExpense('e1', 'dup');

    await expenseRepository.deduplicateCategories();

    expect(await categoryIdOf('e1')).toBe('keep');
    expect(await categoryIds()).toEqual(['keep']);
  });

  it('keeps categories that share a name but differ in type', async () => {
    await seedCategory({ id: 'spend', name: 'Refunds', transactionType: 'expense' });
    await seedCategory({ id: 'earn', name: 'Refunds', transactionType: 'income' });

    await expenseRepository.deduplicateCategories();

    expect(await categoryIds()).toEqual(['earn', 'spend']);
  });

  it('leaves distinct categories alone', async () => {
    await seedCategory({ id: 'a', name: 'Groceries' });
    await seedCategory({ id: 'b', name: 'Transport', sortOrder: 1 });

    await expenseRepository.deduplicateCategories();

    expect(await categoryIds()).toEqual(['a', 'b']);
  });

  it('repairs expenses whose category no longer exists', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    await seedExpense('orphan', 'vanished-category');

    await expenseRepository.deduplicateCategories();

    expect(await categoryIdOf('orphan')).toBe(UNCATEGORIZED_ID);
  });

  // Orphan repair commits in chunks of 450; a single chunk would silently drop
  // everything past the Firestore batch limit.
  it('repairs more orphans than fit in one batch', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    const total = 460;
    for (let start = 0; start < total; start += 400) {
      const batch = writeBatch(emulatorFirestore());
      for (let i = start; i < Math.min(start + 400, total); i++) {
        batch.set(doc(expCol(), `orphan-${i}`), {
          id: `orphan-${i}`,
          amount: 1,
          dateMillis: Date.UTC(2026, 5, 15),
          categoryId: 'vanished-category',
          note: 'bulk',
          transactionType: 'expense',
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
    }

    await expenseRepository.deduplicateCategories();

    const remaining = (await getDocs(expCol())).docs.filter(
      (d) => d.data().categoryId === 'vanished-category',
    );
    expect(remaining).toHaveLength(0);
    const marker = (await getDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`))).data();
    expect(marker?.orphanRepairState).toBe('complete');
    expect(marker?.orphanScanVersion).toBe(1);
    expect(marker?.orphanRepairCursorId).toBeUndefined();
  });
});

describe('account deletion marker', () => {
  it('detects the permanent deletion marker', async () => {
    expect(await expenseRepository.isAccountDeletionPending()).toBe(false);
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/accountDeletion`), {
      pendingDeletion: true,
      state: 'deleting',
    });
    expect(await expenseRepository.isAccountDeletionPending()).toBe(true);
  });

  it('deletes and verifies an empty account', async () => {
    await expect(expenseRepository.deleteAllUserData()).resolves.toBeUndefined();
  });

  it('deletes boundary plus one records without a total-record cap', async () => {
    await seedCategory({ id: 'cat-1', name: 'Groceries' });
    for (let offset = 0; offset < 401; offset += 400) {
      const batch = writeBatch(emulatorFirestore());
      for (let i = offset; i < Math.min(offset + 400, 401); i++) {
        batch.set(doc(expCol(), `expense-${i.toString().padStart(4, '0')}`), {
          id: `expense-${i}`,
          amount: 1,
          dateMillis: Date.UTC(2026, 5, 15),
          categoryId: 'cat-1',
          note: 'deletion boundary',
          transactionType: 'expense',
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
    }
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/settings/preferences`), {
      marker: true,
    });
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`), {
      marker: true,
    });

    for (const id of ['cat-1','cat-2','cat-3']) {
      if (id !== 'cat-1') await seedCategory({id,name:id});
      await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/categoryBudgets/${id}`), {monthlyLimit:100,warningThresholdPercent:80,updatedAt:Date.now()});
    }
    expect((await getDocs(collection(emulatorFirestore(),'users',TEST_UID,'categoryBudgets'))).size).toBe(3);
    await expenseRepository.deleteAllUserData();
    expect((await getDocs(collection(emulatorFirestore(),'users',TEST_UID,'categoryBudgets'))).empty).toBe(true);

    expect((await getDocs(expCol())).empty).toBe(true);
    expect((await getDocs(catCol())).empty).toBe(true);
    expect((await getDoc(doc(emulatorFirestore(), `users/${TEST_UID}/settings/preferences`))).exists()).toBe(false);
    expect((await getDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`))).exists()).toBe(false);
  }, 30_000);

  // The guard that stops a half-deleted account from looking like a fresh one.
  it('refuses to seed while a deletion is pending', async () => {
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/accountDeletion`), {
      pendingDeletion: true,
      state: 'deleting',
    });

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toEqual([]);
  });

});

describe('ensureSeeded', () => {
  it('does not re-seed when categories already exist', async () => {
    await seedCategory({ id: 'only', name: 'Groceries' });

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toContain('only');
    expect((await categoryIds()).length).toBe(1);
  });

  it('does nothing for an unverified account', async () => {
    signInTestUser(false);

    await expenseRepository.ensureSeeded();

    expect(await categoryIds()).toEqual([]);
  });

  it('resumes and finalizes an interrupted Android category type migration', async () => {
    await seedCategory({ id: 'moving', name: 'Moving', transactionType: 'expense' });
    await setDoc(doc(catCol(), 'moving'), {
      migrationState: 'migrating',
      pendingTransactionType: 'income',
    }, { merge: true });
    await seedExpense('old-type', 'moving');
    await seedExpense('already-moved', 'moving');
    await setDoc(doc(expCol(), 'already-moved'), { transactionType: 'income' }, { merge: true });
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`), {
      categoriesDeduped: true,
      orphansScannedAt: Date.now(),
      orphanScanVersion: 1,
    });

    await expenseRepository.ensureSeeded();

    expect(await transactionTypeOf('old-type')).toBe('income');
    expect(await transactionTypeOf('already-moved')).toBe('income');
    const category = (await getDoc(doc(catCol(), 'moving'))).data();
    expect(category?.transactionType).toBe('income');
    expect(category?.migrationState).toBeUndefined();
    expect(category?.pendingTransactionType).toBeUndefined();
  });
});

describe('orphan scan version', () => {
  it('re-runs the sweep when orphansScannedAt is set without a version', async () => {
    await seedCategory({ id: 'keep', name: 'Keep' });
    await seedExpense('orphan', 'vanished');
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`), {
      categoriesDeduped: true,
      ranAt: Date.now(),
      orphansScannedAt: Date.now(),
    });

    await expenseRepository.ensureSeeded();

    expect(await categoryIdOf('orphan')).toBe(UNCATEGORIZED_ID);
    const marker = await getDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`));
    expect(marker.data()?.orphanScanVersion).toBe(1);
  });

  it('skips the sweep when the recorded version is current', async () => {
    await seedCategory({ id: 'keep', name: 'Keep' });
    await seedExpense('orphan', 'vanished');
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`), {
      categoriesDeduped: true,
      ranAt: Date.now(),
      orphansScannedAt: Date.now(),
      orphanScanVersion: 1,
    });

    await expenseRepository.ensureSeeded();

    expect(await categoryIdOf('orphan')).toBe('vanished');
  });
});

describe('write allowlists', () => {
  it('does not persist unknown fields from a category object on update', async () => {
    await seedCategory({ id: 'c1', name: 'Keep' });
    const extra = {
      id: 'c1',
      name: 'Renamed',
      iconName: 'shopping_cart',
      colorInt: -2345678,
      transactionType: 'expense',
      sortOrder: 0,
      cloudId: 'legacy',
      deleted: true,
      sneaky: true,
    };
    await expenseRepository.updateCategory(extra as never);

    const data = (await getDoc(doc(catCol(), 'c1'))).data();
    expect(data?.name).toBe('Renamed');
    expect(data?.cloudId).toBeUndefined();
    expect(data?.deleted).toBeUndefined();
    expect(data?.sneaky).toBeUndefined();
  });
});


describe('Records complete corpus', () => {
  it('finds a target beyond the ordinary cap, scopes dates, and reacts to edits/adds/deletes', async () => {
    await seedCategory({ id: 'search-cat', name: 'Food' });
    for (let first = 0; first < 5002; first += 400) {
      const batch = writeBatch(emulatorFirestore());
      for (let i = first; i < Math.min(first + 400, 5002); i++) {
        batch.set(doc(expCol(), `search-${i}`), { amount: 12.5, dateMillis: i + 1,
          categoryId: 'search-cat', note: i === 0 ? 'old coffee' : 'other', transactionType: 'expense' });
      }
      await batch.commit();
    }
    await setDoc(doc(emulatorFirestore(), 'users', 'other-user', 'expenses', 'secret'), {
      amount: 12.5, dateMillis: 1, categoryId: 'search-cat', note: 'secret coffee', transactionType: 'expense' });
    const capped = await expenseRepository.getAllExpensesCapped(5000);
    expect(capped.truncated).toBe(true);
    expect(capped.items.some(e => e.id === 'search-0')).toBe(false);
    let rows: import('@/models/types').Expense[] = [];
    let incomplete = true;
    let failed = false;
    const stop = expenseRepository.onRecordExpenses(null, null, (items, error, cached) => {
      rows = items; incomplete = cached; failed = error;
    });
    try {
      await vi.waitFor(() => { expect(incomplete).toBe(false); expect(rows).toHaveLength(5002); }, { timeout: 15000 });
      const { filterRecordExpenses } = await import('@/viewmodels/useRecordViewModel');
      const search = () => filterRecordExpenses({ expenses: rows, typeFilter: 'expense', searchQuery: 'coffee',
        categoryIdsFilter: ['search-cat'], minAmount: 12.5, maxAmount: 12.5, categories: [] }).map(e => e.id);
      expect(search()).toEqual(['search-0']);
      await disableNetwork(emulatorFirestore());
      await vi.waitFor(() => expect(incomplete).toBe(true), { timeout: 15000 });
      expect(search()).toEqual(['search-0']);
      await enableNetwork(emulatorFirestore());
      await vi.waitFor(() => expect(incomplete).toBe(false), { timeout: 15000 });
      expect(failed).toBe(false);
      await expect(expenseRepository.deleteExpense('search-0', 'previous-user')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
      await expect(expenseRepository.insertExpense({ amount: 1, dateMillis: 1, categoryId: 'search-cat', note: 'stale', transactionType: 'expense' }, undefined, 'previous-user')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
      await updateDoc(doc(expCol(), 'search-0'), { note: 'tea' });
      await vi.waitFor(() => expect(search()).toEqual([]));
      await setDoc(doc(expCol(), 'new-match'), { amount: 12.5, dateMillis: 6000, categoryId: 'search-cat', note: 'coffee', transactionType: 'expense' });
      await vi.waitFor(() => expect(search()).toEqual(['new-match']));
      await deleteDoc(doc(expCol(), 'new-match'));
      await vi.waitFor(() => expect(search()).toEqual([]));
    } finally { stop(); await enableNetwork(emulatorFirestore()); }
    let rangeRows: import('@/models/types').Expense[] = [];
    const stopRange = expenseRepository.onRecordExpenses(1, 3, (items, error, cached) => { if (!error && !cached) rangeRows = items; });
    try { await vi.waitFor(() => expect(rangeRows.map(e => e.id)).toEqual(['search-1', 'search-0'])); }
    finally { stopRange(); }
  }, 60000);
});


describe('Category budget lifecycle', () => {
  it('streams create/update/remove and suppresses callbacks after owner changes and cleanup', async () => {
    const {categoryBudgetRepository:repo}=await import('@/services/categoryBudgets');
    await seedCategory({id:'budget-cat',name:'Food'});
    await seedCategory({id:'offline-new',name:'New'});
    const b={categoryId:'budget-cat',monthlyLimit:100,warningThresholdPercent:80,updatedAt:Date.now()};
    let rows:import('@/services/categoryBudgets').CategoryBudget[]=[]; let calls=0;
    const stop=repo.observe(TEST_UID,value=>{rows=value;calls++;});
    try {
      await repo.save(TEST_UID,b,b.categoryId,null);
      await vi.waitFor(()=>expect(rows).toHaveLength(1));
      await disableNetwork(emulatorFirestore());
      try {
        await expect(repo.getAll(TEST_UID)).rejects.toThrow();
        await expect(repo.save(TEST_UID,{...b,categoryId:'offline-new'},'offline-new',null)).rejects.toThrow();
        await expect(repo.save(TEST_UID,{...b,monthlyLimit:999},b.categoryId,rows[0].updatedAt)).rejects.toThrow();
        await expect(repo.save(TEST_UID,null,b.categoryId,rows[0].updatedAt)).rejects.toThrow();
        await expect(repo.restore(TEST_UID,{...b,categoryId:'offline-new'},'offline-new')).rejects.toThrow();
        await expect(repo.restore(TEST_UID,{...b,monthlyLimit:999},b.categoryId)).rejects.toThrow();
        await expect(repo.restore(TEST_UID,null,b.categoryId)).rejects.toThrow();
      }
      finally { await enableNetwork(emulatorFirestore()); }
      expect((await repo.getAll(TEST_UID))[0].monthlyLimit).toBe(100);
      const revision=rows[0].updatedAt;
      await repo.save(TEST_UID,{...b,monthlyLimit:200},b.categoryId,revision);
      await vi.waitFor(()=>expect(rows[0].monthlyLimit).toBe(200));
      await expect(repo.save(TEST_UID,b,b.categoryId,revision)).rejects.toThrow('BUDGET_CONFLICT');
      signOutTestUser();const before=calls;
      await updateDoc(doc(emulatorFirestore(),'users',TEST_UID,'categoryBudgets',b.categoryId),{monthlyLimit:300});
      await new Promise(resolve=>setTimeout(resolve,100));expect(calls).toBe(before);
    } finally {stop();}
    signInTestUser();
    const latest=(await repo.getAll(TEST_UID))[0];
    await repo.save(TEST_UID,null,b.categoryId,latest.updatedAt);
    expect(await repo.getAll(TEST_UID)).toEqual([]);
  });
  it.each(['income','transfer'] as const)('deletes budgets atomically and removes them on resumed migration to %s', async target => {
    const {categoryBudgetRepository:repo}=await import('@/services/categoryBudgets');
    await seedCategory({id:'delete-budget',name:'Food'});
    await repo.save(TEST_UID,{categoryId:'delete-budget',monthlyLimit:100,warningThresholdPercent:80,updatedAt:Date.now()},'delete-budget',null);
    await expenseRepository.deleteCategory('delete-budget');expect(await repo.getAll(TEST_UID)).toEqual([]);
    await seedCategory({id:'migrate-budget',name:'Food'});
    await repo.save(TEST_UID,{categoryId:'migrate-budget',monthlyLimit:100,warningThresholdPercent:80,updatedAt:Date.now()},'migrate-budget',null);
    await updateDoc(doc(catCol(),'migrate-budget'),{migrationState:'migrating',pendingTransactionType:target});
    await setDoc(doc(emulatorFirestore(), `users/${TEST_UID}/meta/dedupe`), {categoriesDeduped:true,orphansScannedAt:Date.now(),orphanScanVersion:1});
    expect(await repo.getAll(TEST_UID)).toHaveLength(1); // Interrupted migration retains its budget.
    await expenseRepository.ensureSeeded();
    expect(await repo.getAll(TEST_UID)).toEqual([]);
    expect((await getDoc(doc(catCol(),'migrate-budget'))).data()?.transactionType).toBe(target);
  });
});
