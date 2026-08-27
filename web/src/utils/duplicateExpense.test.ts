import { describe, expect, it } from 'vitest';
import { duplicateExpensePayload } from './duplicateExpense';
import type { Expense } from '../models/types';

describe('duplicateExpensePayload', () => {
  const source: Expense = {
    id: 'abc',
    amount: 12.5,
    dateMillis: 1700000000000,
    categoryId: 'cat-1',
    note: '  lunch  ',
    transactionType: 'expense',
    updatedAt: 1700000001000,
    idempotencyKey: 'original-key',
    deleted: false,
  } as Expense;

  it('keeps the core fields', () => {
    const p = duplicateExpensePayload(source);
    expect(p).toEqual({
      amount: 12.5,
      dateMillis: 1700000000000,
      categoryId: 'cat-1',
      note: '  lunch  ',
      transactionType: 'expense',
    });
  });

  it('never carries the source idempotencyKey into the copy', () => {
    expect('idempotencyKey' in duplicateExpensePayload(source)).toBe(false);
  });

  it('never carries id, updatedAt or deleted', () => {
    const p = duplicateExpensePayload(source) as Record<string, unknown>;
    expect('id' in p).toBe(false);
    expect('updatedAt' in p).toBe(false);
    expect('deleted' in p).toBe(false);
  });

  it('drops legacy fields smuggled onto the runtime object', () => {
    const legacy = { ...source, cloudId: 'old', categoryCloudId: 'c', receiptImagePath: 'p' } as Expense;
    const p = duplicateExpensePayload(legacy) as Record<string, unknown>;
    expect('cloudId' in p).toBe(false);
    expect('categoryCloudId' in p).toBe(false);
    expect('receiptImagePath' in p).toBe(false);
  });
});
