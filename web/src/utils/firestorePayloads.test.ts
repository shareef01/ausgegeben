import { describe, expect, it } from 'vitest';
import { categoryWritePayload, expenseWritePayload } from './firestorePayloads';

describe('categoryWritePayload', () => {
  it('omits legacy and unknown snapshot fields', () => {
    const cat = {
      id: 'c1',
      name: 'Groceries',
      iconName: 'shopping_cart',
      colorInt: -2345678,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 1,
      cloudId: 'old-cloud',
      deleted: true,
      sneaky: true,
    };
    const payload = categoryWritePayload(cat as never, 99);
    expect(payload).toEqual({
      id: 'c1',
      name: 'Groceries',
      iconName: 'shopping_cart',
      colorInt: -2345678,
      transactionType: 'expense',
      sortOrder: 0,
      updatedAt: 99,
    });
    expect('cloudId' in payload).toBe(false);
    expect('deleted' in payload).toBe(false);
    expect('sneaky' in payload).toBe(false);
  });
});

describe('expenseWritePayload', () => {
  it('omits legacy snapshot fields and the source idempotencyKey unless opted in', () => {
    const expense = {
      id: 'e1',
      amount: 10.005,
      dateMillis: 1,
      categoryId: 'c1',
      note: '  hi  ',
      transactionType: 'expense' as const,
      updatedAt: 1,
      idempotencyKey: 'old-key',
      cloudId: 'x',
      categoryCloudId: 'y',
      receiptImagePath: null,
      deleted: true,
    };
    const payload = expenseWritePayload(expense as never, { updatedAt: 50 });
    expect(payload).toEqual({
      id: 'e1',
      amount: 10.01,
      dateMillis: 1,
      categoryId: 'c1',
      note: 'hi',
      transactionType: 'expense',
      updatedAt: 50,
    });
    expect('idempotencyKey' in payload).toBe(false);
    expect('deleted' in payload).toBe(false);
    expect('cloudId' in payload).toBe(false);
  });

  it('includes idempotencyKey only when provided for insert', () => {
    const payload = expenseWritePayload(
      {
        id: 'e2',
        amount: 1,
        dateMillis: 1,
        categoryId: 'c1',
        note: '',
        transactionType: 'expense',
      },
      { updatedAt: 1, idempotencyKey: 'k1' },
    );
    expect(payload.idempotencyKey).toBe('k1');
  });
});
