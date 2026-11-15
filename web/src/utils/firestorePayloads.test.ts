import { describe, expect, it } from 'vitest';
import { categoryWritePayload, expenseUpdatePatch, expenseWritePayload } from './firestorePayloads';

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

describe('expenseUpdatePatch (AUS-104)', () => {
  const base = { amount: 10, dateMillis: 1_700_000_000_000, categoryId: 'food', note: 'Lunch', transactionType: 'expense' };
  const stored = { ...base, updatedAt: 5, cloudId: 'legacy' };

  it('sends only the fields the user changed', () => {
    expect(expenseUpdatePatch({ ...base, note: 'Dinner' }, base, stored)).toEqual({ note: 'Dinner' });
    expect(expenseUpdatePatch({ ...base, amount: 15 }, base, stored)).toEqual({ amount: 15 });
  });

  it('sends nothing when nothing changed', () => {
    expect(expenseUpdatePatch({ ...base }, base, stored)).toEqual({});
  });

  it('sends category and type together when either changes', () => {
    expect(expenseUpdatePatch({ ...base, categoryId: 'eating-out' }, base, stored))
      .toEqual({ categoryId: 'eating-out', transactionType: 'expense' });
    expect(expenseUpdatePatch({ ...base, transactionType: 'income', categoryId: 'salary' }, base, stored))
      .toEqual({ categoryId: 'salary', transactionType: 'income' });
  });

  it('does not resend a field another device changed since this editor loaded it', () => {
    // The server already holds amount 15 from the other device; this editor changed only
    // the note and still has amount 10 from when it loaded.
    const server = { ...stored, amount: 15 };
    expect(expenseUpdatePatch({ ...base, note: 'Dinner' }, base, server)).toEqual({ note: 'Dinner' });
  });

  it('also sends an unchanged field whose stored shape is legacy (missing or wrong type)', () => {
    const legacy = { amount: '10', dateMillis: base.dateMillis, categoryId: 'food', transactionType: 'expense' };
    expect(expenseUpdatePatch({ ...base, note: 'Dinner' }, base, legacy))
      .toEqual({ amount: 10, note: 'Dinner' });
  });

  it('sends every field when there is no original to compare against', () => {
    expect(expenseUpdatePatch({ ...base }, null, stored)).toEqual(base);
  });
});
