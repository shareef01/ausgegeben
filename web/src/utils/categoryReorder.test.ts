import { describe, it, expect } from 'vitest';
import { categoriesAfterMove } from './categoryReorder';
import type { Category } from '@/models/types';
import { UNCATEGORIZED_ID } from '@/repositories/expenseRepository';

const cat = (id: string, sortOrder: number, transactionType: 'expense' | 'income' = 'expense'): Category => ({
  id,
  name: `Cat ${id}`,
  iconName: 'shopping_cart',
  colorInt: 0,
  transactionType,
  sortOrder,
});

describe('categoriesAfterMove', () => {
  it('moves second item up to first position', () => {
    const list = [cat('a', 0), cat('b', 1), cat('c', 2)];
    const result = categoriesAfterMove(list, list[1], true);
    expect(result).toEqual([
      { ...list[1], sortOrder: 0 },
      { ...list[0], sortOrder: 1 },
    ]);
  });

  it('moves first item down to second position', () => {
    const list = [cat('a', 0), cat('b', 1), cat('c', 2)];
    const result = categoriesAfterMove(list, list[0], false);
    expect(result).toEqual([
      { ...list[1], sortOrder: 0 },
      { ...list[0], sortOrder: 1 },
    ]);
  });

  it('returns empty array when moving top item up or bottom item down', () => {
    const list = [cat('a', 0), cat('b', 1)];
    expect(categoriesAfterMove(list, list[0], true)).toEqual([]);
    expect(categoriesAfterMove(list, list[1], false)).toEqual([]);
  });

  it('normalizes duplicate sortOrder values cleanly', () => {
    const list = [cat('a', 1000), cat('b', 1000), cat('c', 1000)];
    const result = categoriesAfterMove(list, list[1], true);
    expect(result.length).toBeGreaterThan(0);
    // All modified categories now have distinct sequential sortOrder
    const sortOrders = result.map((c) => c.sortOrder);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
  });

  it('ignores categories of different transaction type and uncategorized sentinel', () => {
    const list = [
      cat('a', 0, 'expense'),
      cat('inc', 0, 'income'),
      cat(UNCATEGORIZED_ID, 999, 'expense'),
      cat('b', 1, 'expense'),
    ];
    const result = categoriesAfterMove(list, list[3], true);
    expect(result).toEqual([
      { ...list[3], sortOrder: 0 },
      { ...list[0], sortOrder: 1 },
    ]);
  });
});
