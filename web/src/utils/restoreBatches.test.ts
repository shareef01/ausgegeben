import { describe, expect, it } from 'vitest';
import { chunkByCategory } from './restoreBatches';

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
