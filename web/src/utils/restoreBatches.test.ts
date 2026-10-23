import { describe, expect, it } from 'vitest';
import {
  chunkByBudgetCheck,
  chunkByCategory,
  RESTORE_BATCH_MAX_BUDGET_CHECKS,
  RESTORE_BATCH_MAX_DOCUMENT_ACCESS,
} from './restoreBatches';

const rows = (cats: string[]) => cats.map((categoryId, i) => ({ id: `e${i}`, categoryId }));

describe('chunkByCategory', () => {
  it('keeps every batch under the category cap', () => {
    const input = rows(Array.from({ length: 40 }, (_, i) => `c${i % 17}`));
    const chunks = chunkByCategory(input, 400, 8);
    for (const c of chunks) expect(new Set(c.map((r) => r.categoryId)).size).toBeLessThanOrEqual(8);
    expect(chunks.flat()).toEqual(input);
  });

  it('keeps every batch under the row cap', () => {
    const input = rows(Array.from({ length: 9 }, () => 'c1'));
    expect(chunkByCategory(input, 4, 8).map((c) => c.length)).toEqual([4, 4, 1]);
  });

  it('returns no batches for no rows', () => {
    expect(chunkByCategory([], 400)).toEqual([]);
  });
});

// AUD-001: category batches are limited by document-access cost, not row count.
// Mirrors app/src/test/java/com/aus/ausgegeben/util/RestoreBatchesTest.kt.
describe('chunkByBudgetCheck', () => {
  type Row = { id: string; transactionType: 'expense' | 'income' | 'transfer' };

  const makeRows = (expense: number, other: number): Row[] => [
    ...Array.from({ length: expense }, (_, i) => ({ id: `e${i}`, transactionType: 'expense' as const })),
    ...Array.from({ length: other }, (_, i) => ({
      id: `o${i}`,
      transactionType: (i % 2 === 0 ? 'income' : 'transfer') as 'income' | 'transfer',
    })),
  ];

  const chunksOf = (input: Row[], maxRows = 400, maxChecks?: number) =>
    chunkByBudgetCheck(input, maxRows, maxChecks, (r) => r.transactionType !== 'expense');

  it.each([19, 20, 25, 50, 100])(
    'never puts more than %i non-expense rows in one batch',
    (others) => {
      const input = makeRows(0, others);
      const chunks = chunksOf(input);
      for (const chunk of chunks) {
        expect(chunk.filter((r) => r.transactionType !== 'expense').length).toBeLessThanOrEqual(
          RESTORE_BATCH_MAX_BUDGET_CHECKS,
        );
      }
      expect(chunks.flat().map((r) => r.id)).toEqual(input.map((r) => r.id));
    },
  );

  it('splits 25 non-expense rows as 16+9 and 19 as 16+3', () => {
    expect(chunksOf(makeRows(0, 25)).map((c) => c.length)).toEqual([16, 9]);
    expect(chunksOf(makeRows(0, 19)).map((c) => c.length)).toEqual([16, 3]);
    expect(chunksOf(makeRows(0, RESTORE_BATCH_MAX_BUDGET_CHECKS)).map((c) => c.length)).toEqual([
      RESTORE_BATCH_MAX_BUDGET_CHECKS,
    ]);
  });

  it('does not split a wide mixed batch, because expense rows are free', () => {
    expect(chunksOf(makeRows(30, 10)).map((c) => c.length)).toEqual([40]);
  });

  it('still applies the row cap independently of the access budget', () => {
    expect(chunksOf(makeRows(9, 0), 4).map((c) => c.length)).toEqual([4, 4, 1]);
  });

  it('splits every checked row when the budget is one', () => {
    expect(chunksOf(makeRows(2, 3), 400, 1).map((c) => c.length)).toEqual([3, 1, 1]);
  });

  it('returns no batches for no rows', () => {
    expect(chunksOf([])).toEqual([]);
  });

  it('rejects non-positive limits instead of emitting empty chunks', () => {
    expect(() => chunksOf(makeRows(1, 1), 0)).toThrow(/maxRows/);
    expect(() => chunksOf(makeRows(1, 1), 400, 0)).toThrow(/maxChecks/);
  });

  it('pins the measured ceiling and its reserve', () => {
    expect(RESTORE_BATCH_MAX_DOCUMENT_ACCESS).toBe(20);
    expect(RESTORE_BATCH_MAX_BUDGET_CHECKS).toBe(16);
    expect(RESTORE_BATCH_MAX_BUDGET_CHECKS).toBeLessThan(RESTORE_BATCH_MAX_DOCUMENT_ACCESS);
  });
});
