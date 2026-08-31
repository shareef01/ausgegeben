import { describe, expect, it } from 'vitest';
import {
  isStoredCategorySelectable,
  selectableCategoriesFor,
} from '@/viewmodels/useAddTransactionViewModel';
import { UNCATEGORIZED_ID } from '@/repositories/expenseRepository';
import type { Category } from '@/models/types';

/**
 * Regression cover for the silent re-categorisation bug (AUS-101).
 *
 * Deleting a category repoints its transactions at the Uncategorized sentinel '0', which
 * the picker deliberately hides. The edit form used to react to "not in the picker" by
 * substituting the first category in the list, so opening such a transaction to fix its
 * note silently refiled it. Android has never done this — loadForEdit leaves the
 * selection null and saveExpense refuses — so this asserts the web parity.
 */
const cat = (over: Partial<Category>): Category => ({
  id: 'c1',
  name: 'Groceries',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense',
  sortOrder: 0,
  ...over,
});

const cats: Category[] = [
  cat({ id: 'a', name: 'Alpha', sortOrder: 0 }),
  cat({ id: 'b', name: 'Beta', sortOrder: 1 }),
  cat({ id: 'inc', name: 'Salary', transactionType: 'income', sortOrder: 0 }),
  cat({ id: UNCATEGORIZED_ID, name: 'Unknown', sortOrder: 999 }),
  cat({ id: 'blank', name: '   ', sortOrder: 2 }),
];

describe('selectableCategoriesFor', () => {
  it('offers only same-type, named, non-sentinel categories', () => {
    expect(selectableCategoriesFor(cats, 'expense').map((c) => c.id)).toEqual(['a', 'b']);
    expect(selectableCategoriesFor(cats, 'income').map((c) => c.id)).toEqual(['inc']);
    expect(selectableCategoriesFor(cats, 'transfer')).toEqual([]);
  });
});

describe('isStoredCategorySelectable', () => {
  it('accepts a category the user could have picked', () => {
    expect(isStoredCategorySelectable(cats, 'expense', 'a')).toBe(true);
    expect(isStoredCategorySelectable(cats, 'income', 'inc')).toBe(true);
  });

  it('rejects the Uncategorized sentinel, so the save is blocked rather than reassigned', () => {
    expect(isStoredCategorySelectable(cats, 'expense', UNCATEGORIZED_ID)).toBe(false);
  });

  it('rejects an orphan whose category was deleted', () => {
    expect(isStoredCategorySelectable(cats, 'expense', 'deleted-cat')).toBe(false);
  });

  it('rejects a category belonging to a different transaction type', () => {
    expect(isStoredCategorySelectable(cats, 'expense', 'inc')).toBe(false);
  });

  it('rejects a blank-named legacy category the picker hides', () => {
    expect(isStoredCategorySelectable(cats, 'expense', 'blank')).toBe(false);
  });

  it('rejects a null categoryId', () => {
    expect(isStoredCategorySelectable(cats, 'expense', null)).toBe(false);
  });

  it('agrees with the picker for every category, so the two cannot drift', () => {
    for (const type of ['expense', 'income', 'transfer'] as const) {
      const offered = selectableCategoriesFor(cats, type).map((c) => c.id);
      for (const c of cats) {
        expect(isStoredCategorySelectable(cats, type, c.id)).toBe(offered.includes(c.id));
      }
    }
  });
});
