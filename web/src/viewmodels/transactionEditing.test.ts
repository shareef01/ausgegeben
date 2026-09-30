import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  writeExpense,
  runExclusive,
  selectableCategoriesFor,
  isStoredCategorySelectable,
} from './useAddTransactionViewModel';
import { expenseRepository, UNCATEGORIZED_ID } from '@/repositories/expenseRepository';
import { useAuthStore } from '@/services/authStore';
import { formatAmountForInput } from '@/utils/currency';
import type { Category, Expense } from '@/models/types';

const expenseCategory: Category = {
  id: 'c1',
  name: 'Groceries',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense',
  sortOrder: 0,
};

const incomeCategory: Category = {
  id: 'c2',
  name: 'Salary',
  iconName: 'cash',
  colorInt: -1234567,
  transactionType: 'income',
  sortOrder: 1,
};

const sampleCategories: Category[] = [
  expenseCategory,
  incomeCategory,
  { id: UNCATEGORIZED_ID, name: 'Uncategorized', iconName: 'help', colorInt: -1, transactionType: 'expense', sortOrder: 999 },
];

describe('Transaction Editing Semantic Contract (Web)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: {
        uid: 'user-a',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
      },
      ready: true,
    });
  });

  // WEB-E1: editor prefills existing transaction
  it('WEB-E1: editor prefills existing transaction correctly', () => {
    const existing: Expense = {
      id: 'e1',
      amount: 45.5,
      dateMillis: 1700000000000,
      categoryId: 'c1',
      note: 'Weekly grocery run',
      transactionType: 'expense',
    };

    const formattedAmount = formatAmountForInput(existing.amount, 'EUR');
    const isSelectable = isStoredCategorySelectable(sampleCategories, existing.transactionType, existing.categoryId);

    expect(formattedAmount).toBe('45,50');
    expect(isSelectable).toBe(true);
    expect(existing.note).toBe('Weekly grocery run');
    expect(existing.dateMillis).toBe(1700000000000);
    expect(existing.transactionType).toBe('expense');
  });

  // WEB-E2: changed fields update same transaction ID
  it('WEB-E2: changed fields update same transaction ID without inserting a new document', async () => {
    const updateSpy = vi.spyOn(expenseRepository, 'updateExpense').mockResolvedValue();
    const insertSpy = vi.spyOn(expenseRepository, 'insertExpense');

    const savedId = await writeExpense({
      uid: 'user-a',
      expenseId: 'e1',
      payload: {
        amount: 55.0,
        categoryId: 'c1',
        note: 'Updated notes',
        dateMillis: 1700000500000,
        transactionType: 'expense',
      },
    });

    expect(savedId).toBe('e1');
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({
      id: 'e1',
      amount: 55.0,
      categoryId: 'c1',
      note: 'Updated notes',
      dateMillis: 1700000500000,
      transactionType: 'expense',
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  // WEB-E3: unchanged fields remain intact
  it('WEB-E3: unchanged fields remain intact when saving an edit', async () => {
    const updateSpy = vi.spyOn(expenseRepository, 'updateExpense').mockResolvedValue();

    const existing: Expense = {
      id: 'e1',
      amount: 45.5,
      dateMillis: 1700000000000,
      categoryId: 'c1',
      note: 'Original note',
      transactionType: 'expense',
    };

    // User only changes amount; note, dateMillis, categoryId, transactionType remain unchanged
    await writeExpense({
      uid: 'user-a',
      expenseId: existing.id,
      payload: {
        amount: 99.0,
        dateMillis: existing.dateMillis,
        categoryId: existing.categoryId,
        note: existing.note,
        transactionType: existing.transactionType,
      },
    });

    expect(updateSpy).toHaveBeenCalledWith({
      id: 'e1',
      amount: 99.0,
      dateMillis: 1700000000000,
      categoryId: 'c1',
      note: 'Original note',
      transactionType: 'expense',
    });
  });

  // WEB-E4: category/type validation
  it('WEB-E4: rejects category/type mismatch and clears incompatible category', () => {
    // Expense transaction cannot use income category
    expect(isStoredCategorySelectable(sampleCategories, 'expense', 'c2')).toBe(false);

    // Switching to income type filters to only income categories
    const incomeCats = selectableCategoriesFor(sampleCategories, 'income');
    expect(incomeCats.map((c) => c.id)).toEqual(['c2']);
    expect(incomeCats.some((c) => c.id === 'c1')).toBe(false);
  });

  // WEB-E5: missing category behavior
  it('WEB-E5: missing or deleted category is rejected rather than silently guessing a replacement', () => {
    // Uncategorized sentinel is rejected
    expect(isStoredCategorySelectable(sampleCategories, 'expense', UNCATEGORIZED_ID)).toBe(false);

    // Deleted category is rejected
    expect(isStoredCategorySelectable(sampleCategories, 'expense', 'deleted-cat-id')).toBe(false);

    // Null category is rejected
    expect(isStoredCategorySelectable(sampleCategories, 'expense', null)).toBe(false);
  });

  // WEB-E6: save failure preserves editor state
  it('WEB-E6: save failure throws and does not corrupt caller state', async () => {
    vi.spyOn(expenseRepository, 'updateExpense').mockRejectedValue(new Error('NETWORK_TIMEOUT'));

    await expect(
      writeExpense({
        uid: 'user-a',
        expenseId: 'e1',
        payload: {
          amount: 45.5,
          categoryId: 'c1',
          note: 'Still here',
          dateMillis: 1700000000000,
          transactionType: 'expense',
        },
      }),
    ).rejects.toThrow('NETWORK_TIMEOUT');
  });

  // WEB-E7: duplicate Save cannot produce overlapping updates
  it('WEB-E7: duplicate Save cannot produce overlapping updates', async () => {
    const guardRef = { current: false };
    let callsRunning = 0;
    let maxOverlappingCalls = 0;

    const slowSave = async () => {
      callsRunning++;
      maxOverlappingCalls = Math.max(maxOverlappingCalls, callsRunning);
      await new Promise((resolve) => setTimeout(resolve, 30));
      callsRunning--;
      return 'saved';
    };

    // Fire two saves simultaneously using runExclusive
    const [res1, res2] = await Promise.all([
      runExclusive(guardRef, slowSave),
      runExclusive(guardRef, slowSave),
    ]);

    expect(maxOverlappingCalls).toBe(1);
    expect(res1.ok).toBe(true);
    if (res1.ok) expect(res1.value).toBe('saved');
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.reason).toBe('overlapping');

    // After completion, the guard is released so sequential save succeeds
    const sequential = await runExclusive(guardRef, slowSave);
    expect(sequential.ok).toBe(true);
  });

  // WEB-E8: deleted transaction is not recreated
  it('WEB-E8: deleted transaction is not recreated on edit save', async () => {
    vi.spyOn(expenseRepository, 'updateExpense').mockRejectedValue(new Error('EXPENSE_NOT_FOUND'));
    const insertSpy = vi.spyOn(expenseRepository, 'insertExpense');

    await expect(
      writeExpense({
        uid: 'user-a',
        expenseId: 'e1',
        payload: {
          amount: 45.5,
          categoryId: 'c1',
          note: 'Trying to resurrect',
          dateMillis: 1700000000000,
          transactionType: 'expense',
        },
      }),
    ).rejects.toThrow('EXPENSE_NOT_FOUND');

    expect(insertSpy).not.toHaveBeenCalled();
  });

  // WEB-E9: auth/account change cannot mutate stale transaction
  it('WEB-E9: unauthenticated writeExpense fails immediately without touching repository', async () => {
    const updateSpy = vi.spyOn(expenseRepository, 'updateExpense');

    await expect(
      writeExpense({
        uid: undefined,
        expenseId: 'e1',
        payload: {
          amount: 45.5,
          categoryId: 'c1',
          note: 'Unauthenticated edit',
          dateMillis: 1700000000000,
          transactionType: 'expense',
        },
      }),
    ).rejects.toThrow('Not signed in');

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
