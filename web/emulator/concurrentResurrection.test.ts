import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository, invalidateAllExpensesCache } = await import('@/repositories/expenseRepository');
const { doc, getDoc } = await import('firebase/firestore');

describe('F-01 and F-02 concurrent resurrection protections', () => {
  let categoryId: string;

  beforeAll(startHarness);
  afterAll(stopHarness);

  beforeEach(async () => {
    await resetHarness();
    invalidateAllExpensesCache();
    signInTestUser();
    categoryId = await expenseRepository.insertCategory({
      name: 'Dining',
      iconName: 'utensils',
      colorInt: 100,
      transactionType: 'expense',
      sortOrder: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('F-01: updating a deleted expense rejects and does NOT resurrect the document', async () => {
    // Device A / user creates an expense
    const expenseId = await expenseRepository.insertExpense({
      amount: 42.50,
      dateMillis: Date.now(),
      categoryId,
      note: 'Lunch meeting',
      transactionType: 'expense',
    });

    const expRef = doc(emulatorFirestore(), 'users', TEST_UID, 'expenses', expenseId);
    expect((await getDoc(expRef)).exists()).toBe(true);

    // Device B deletes the expense
    await expenseRepository.deleteExpense(expenseId);
    expect((await getDoc(expRef)).exists()).toBe(false);

    // Device A attempts to save an edit on the deleted expense
    await expect(
      expenseRepository.updateExpense({
        id: expenseId,
        amount: 55.00,
        dateMillis: Date.now(),
        categoryId,
        note: 'Lunch meeting edited',
        transactionType: 'expense',
      })
    ).rejects.toThrow();

    // Verify document was NOT resurrected
    const afterSnap = await getDoc(expRef);
    expect(afterSnap.exists()).toBe(false);
  });

  it('F-02: updating a deleted category rejects and does NOT resurrect the category', async () => {
    const catId = await expenseRepository.insertCategory({
      name: 'Travel',
      iconName: 'plane',
      colorInt: 200,
      transactionType: 'expense',
      sortOrder: 1,
    });

    const catRef = doc(emulatorFirestore(), 'users', TEST_UID, 'categories', catId);
    expect((await getDoc(catRef)).exists()).toBe(true);

    // Concurrently deleted
    await expenseRepository.deleteCategory(catId);
    expect((await getDoc(catRef)).exists()).toBe(false);

    // Attempt edit
    await expect(
      expenseRepository.updateCategory({
        id: catId,
        name: 'Flights',
        iconName: 'plane',
        colorInt: 200,
        transactionType: 'expense',
        sortOrder: 1,
      })
    ).rejects.toThrow();

    // Verify document was NOT resurrected
    const afterSnap = await getDoc(catRef);
    expect(afterSnap.exists()).toBe(false);
  });

  it('F-02: batch category update with a deleted category fails and does NOT resurrect it', async () => {
    const catId1 = await expenseRepository.insertCategory({
      name: 'Groceries',
      iconName: 'shopping-cart',
      colorInt: 300,
      transactionType: 'expense',
      sortOrder: 1,
    });

    const catId2 = await expenseRepository.insertCategory({
      name: 'Utilities',
      iconName: 'zap',
      colorInt: 400,
      transactionType: 'expense',
      sortOrder: 2,
    });

    const cat1Ref = doc(emulatorFirestore(), 'users', TEST_UID, 'categories', catId1);
    const cat2Ref = doc(emulatorFirestore(), 'users', TEST_UID, 'categories', catId2);

    // Concurrently delete catId2
    await expenseRepository.deleteCategory(catId2);
    expect((await getDoc(cat2Ref)).exists()).toBe(false);

    // Reorder batch touches catId1 and catId2
    await expect(
      expenseRepository.updateCategoriesBatch([
        {
          id: catId1,
          name: 'Groceries',
          iconName: 'shopping-cart',
          colorInt: 300,
          transactionType: 'expense',
          sortOrder: 2,
        },
        {
          id: catId2,
          name: 'Utilities',
          iconName: 'zap',
          colorInt: 400,
          transactionType: 'expense',
          sortOrder: 1,
        },
      ])
    ).rejects.toThrow();

    // catId2 must not be resurrected
    expect((await getDoc(cat2Ref)).exists()).toBe(false);
  });

  it('isAccountDeletionPending checks the explicit targetUid rather than active session', async () => {
    // When deletion is marked for TEST_UID
    await expenseRepository.markAccountDeletionPending();
    expect(await expenseRepository.isAccountDeletionPending(TEST_UID)).toBe(true);

    // A different UID with no pending deletion returns false
    expect(await expenseRepository.isAccountDeletionPending('other-user-uid')).toBe(false);
  });
});
