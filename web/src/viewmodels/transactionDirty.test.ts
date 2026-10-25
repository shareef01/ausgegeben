import { describe, expect, it } from 'vitest';
import { isTransactionDraftDirty, localDayKey, type TransactionDraft } from '@/viewmodels/transactionDirty';

const day = new Date(2026, 9, 24, 10, 30, 0).getTime();

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    amountInput: '12,50',
    transactionType: 'expense',
    categoryId: 'cat-food',
    note: '  Lunch  ',
    dateMillis: day,
    ...overrides,
  };
}

describe('isTransactionDraftDirty', () => {
  it('is clean when nothing changed', () => {
    expect(isTransactionDraftDirty(draft(), draft(), 'EUR')).toBe(false);
  });

  it('treats an equivalent amount as unchanged', () => {
    expect(isTransactionDraftDirty(draft({ amountInput: '12,50' }), draft({ amountInput: '12.5' }), 'EUR')).toBe(false);
    expect(isTransactionDraftDirty(draft({ amountInput: '12.50' }), draft({ amountInput: '12,50' }), 'EUR')).toBe(false);
  });

  it('detects an amount change and a cleared amount', () => {
    expect(isTransactionDraftDirty(draft(), draft({ amountInput: '13' }), 'EUR')).toBe(true);
    expect(isTransactionDraftDirty(draft(), draft({ amountInput: '' }), 'EUR')).toBe(true);
  });

  it('ignores surrounding whitespace in the note', () => {
    expect(isTransactionDraftDirty(draft({ note: 'Lunch' }), draft({ note: '  Lunch ' }), 'EUR')).toBe(false);
    expect(isTransactionDraftDirty(draft(), draft({ note: 'Dinner' }), 'EUR')).toBe(true);
    expect(isTransactionDraftDirty(draft({ note: 'Lunch' }), draft({ note: '' }), 'EUR')).toBe(true);
  });

  it('detects a type or category change', () => {
    expect(isTransactionDraftDirty(draft(), draft({ transactionType: 'income' }), 'EUR')).toBe(true);
    expect(isTransactionDraftDirty(draft(), draft({ categoryId: 'cat-other' }), 'EUR')).toBe(true);
    expect(isTransactionDraftDirty(draft({ categoryId: null }), draft({ categoryId: 'cat-food' }), 'EUR')).toBe(true);
  });

  it('ignores the time of day but detects a different day', () => {
    const sameDay = new Date(2026, 9, 24, 23, 59, 0).getTime();
    const nextDay = new Date(2026, 9, 25, 0, 1, 0).getTime();
    expect(localDayKey(sameDay)).toBe(localDayKey(day));
    expect(isTransactionDraftDirty(draft(), draft({ dateMillis: sameDay }), 'EUR')).toBe(false);
    expect(isTransactionDraftDirty(draft(), draft({ dateMillis: nextDay }), 'EUR')).toBe(true);
  });

  it('never reports dirty before a baseline exists', () => {
    expect(isTransactionDraftDirty(null, draft(), 'EUR')).toBe(false);
  });
});
