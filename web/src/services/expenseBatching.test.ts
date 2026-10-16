import { describe, expect, it } from 'vitest';
import {
  chunkExpensesForRules,
  EXPENSE_BATCH_MAX_CATEGORIES,
  EXPENSE_BATCH_MAX_WRITES,
} from '@/services/expenseBatching';

const rows = (categories: number, perCategory: number) =>
  Array.from({ length: categories * perCategory }, (_, i) => ({
    id: `e${i}`,
    categoryId: `cat-${i % categories}`,
  }));

describe('chunkExpensesForRules', () => {
  it('keeps every batch within the write and category limits', () => {
    const items = rows(17, 30);
    const chunks = chunkExpensesForRules(items);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(EXPENSE_BATCH_MAX_WRITES);
      expect(new Set(chunk.map((e) => e.categoryId)).size).toBeLessThanOrEqual(EXPENSE_BATCH_MAX_CATEGORIES);
    }
    expect(chunks.flat().map((e) => e.id).sort()).toEqual(items.map((e) => e.id).sort());
  });

  it('splits on write count when one category is large', () => {
    const chunks = chunkExpensesForRules(rows(1, 450));
    expect(chunks.map((c) => c.length)).toEqual([400, 50]);
  });

  it('packs few categories into one batch and returns nothing for no input', () => {
    expect(chunkExpensesForRules(rows(8, 10))).toHaveLength(1);
    expect(chunkExpensesForRules(rows(9, 10))).toHaveLength(2);
    expect(chunkExpensesForRules([])).toEqual([]);
  });
});
