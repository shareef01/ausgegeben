import { describe, expect, it } from 'vitest';
import { pickDedupeMaster } from '@/repositories/expenseRepository';
import type { Category } from '@/models/types';

function cat(partial: Partial<Category> & Pick<Category, 'id' | 'sortOrder'>): Category {
  return {
    name: 'Food',
    iconName: 'x',
    colorInt: 1,
    transactionType: 'expense',
    ...partial,
  };
}

describe('pickDedupeMaster', () => {
  it('prefers lowest sortOrder', () => {
    const master = pickDedupeMaster([
      cat({ id: 'b', sortOrder: 2 }),
      cat({ id: 'a', sortOrder: 0 }),
    ]);
    expect(master.id).toBe('a');
  });

  it('breaks ties with lexicographically smaller id', () => {
    const master = pickDedupeMaster([
      cat({ id: 'zzz', sortOrder: 1 }),
      cat({ id: 'aaa', sortOrder: 1 }),
    ]);
    expect(master.id).toBe('aaa');
  });
});
