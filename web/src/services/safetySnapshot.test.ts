import { describe, expect, it } from 'vitest';
import {
  budgets,
  categories,
  chunkCount,
  declaredCount,
  expenses,
  InvalidSnapshotError,
  operationId,
  preferences,
  receipts,
  requireCount,
  templates,
} from './safetySnapshot';

/**
 * AUD-006 parity suite. Mirrors
 * app/src/test/java/com/aus/ausgegeben/util/SafetySnapshotTest.kt: the safety snapshot is read
 * back as authoritative state for a rollback, so every malformed shape must fail closed with a
 * path-anchored code instead of defaulting a field or dropping a row.
 */

const UUID = '11111111-2222-4333-8444-555555555555';

const meta = (overrides: Record<string, unknown> = {}) => ({
  operationId: 'replace_1_abc',
  chunkCount: 1,
  totalExpenses: 1,
  totalCategories: 1,
  receiptChunkCount: 0,
  totalReceipts: 0,
  categories: [
    { id: 'cat-1', name: 'Food', iconName: 'restaurant', colorInt: -16_731_948, transactionType: 'expense', sortOrder: 0 },
  ],
  ...overrides,
});

const expenseRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'exp-1',
  amount: 12.5,
  dateMillis: 1_700_000_000_000,
  categoryId: 'cat-1',
  note: 'lunch',
  transactionType: 'expense',
  ...overrides,
});

const chunkOf = (rows: unknown[]) => ({ expenses: rows });

function expectInvalid(fragment: string, block: () => unknown) {
  try {
    block();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidSnapshotError);
    expect((error as InvalidSnapshotError).message).toContain(fragment);
    return;
  }
  throw new Error(`expected InvalidSnapshotError containing "${fragment}"`);
}

describe('safetySnapshot: well-formed input', () => {
  it('reads a complete snapshot without dropping rows', () => {
    const parsed = categories(meta());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Food');
    requireCount(declaredCount(meta(), 'totalCategories'), parsed.length, 'meta.totalCategories');

    expect(expenses(chunkOf([expenseRow(), expenseRow()]), 'chunk_0')).toHaveLength(2);
  });

  it('keeps the legacy normalizations the writer itself produces', () => {
    // The web client records 0 / 0 for an unreadable legacy row; refusing these would block
    // recovery for exactly the accounts the rules tolerate.
    const [row] = expenses(chunkOf([expenseRow({ amount: 0, dateMillis: 0, categoryId: '0' })]), 'chunk_0');
    expect(row.amount).toBe(0);
    expect(row.dateMillis).toBe(0);
    expect(row.categoryId).toBe('0');
  });

  it('preserves the optional legacy fields a rollback writes back', () => {
    const [row] = expenses(
      chunkOf([expenseRow({ deleted: true, cloudId: 'abc', categoryCloudId: 7, receiptImagePath: null })]),
      'chunk_0',
    );
    expect(row.deleted).toBe(true);
    expect(row.cloudId).toBe('abc');
    expect(row.categoryCloudId).toBe(7);
  });

  it('treats an absent optional section as empty and a wrong type as an error', () => {
    expect(budgets(meta())).toBeUndefined();
    expect(templates(meta())).toBeUndefined();
    expect(preferences(meta())).toBeNull();
    expectInvalid('categoryBudgets', () => budgets({ categoryBudgets: 'nope' }));
  });
});

describe('safetySnapshot: fail-closed on rows the old reader dropped or defaulted', () => {
  it('refuses an expenses container of the wrong shape instead of reading it as empty', () => {
    expectInvalid('chunk_0.expenses', () => expenses({ expenses: { amount: 1 } }, 'chunk_0'));
  });

  it('refuses an expense row without an id instead of skipping it', () => {
    expectInvalid('chunk_0.expenses[0].id', () => expenses(chunkOf([{ ...expenseRow(), id: undefined }]), 'chunk_0'));
  });

  it('refuses a missing amount instead of defaulting it to zero', () => {
    expectInvalid('amount', () => expenses(chunkOf([expenseRow({ amount: null })]), 'chunk_0'));
  });

  it('refuses a non-numeric or negative amount', () => {
    expectInvalid('amount', () => expenses(chunkOf([expenseRow({ amount: '12,50' })]), 'chunk_0'));
    expectInvalid('amount', () => expenses(chunkOf([expenseRow({ amount: -1 })]), 'chunk_0'));
  });

  it('refuses a missing date instead of dating the row to 1970', () => {
    expectInvalid('dateMillis', () => expenses(chunkOf([expenseRow({ dateMillis: undefined })]), 'chunk_0'));
  });

  it('refuses a category with no name rather than dropping it', () => {
    expectInvalid('categories[0].name', () =>
      categories(meta({ categories: [{ id: 'c', name: '   ', iconName: 'x', colorInt: 1, transactionType: 'expense', sortOrder: 0 }] })),
    );
  });

  it('refuses an unsupported transaction type and an out-of-range sort order', () => {
    expectInvalid('transactionType', () => expenses(chunkOf([expenseRow({ transactionType: 'refund' })]), 'chunk_0'));
    expectInvalid('sortOrder', () =>
      categories(meta({ categories: [{ id: 'c', name: 'X', iconName: 'x', colorInt: 1, transactionType: 'expense', sortOrder: 12_000 }] })),
    );
  });

  it('refuses an unreadable budget instead of throwing a raw TypeError', () => {
    expectInvalid('categoryBudgets[0].monthlyLimit', () =>
      budgets({ categoryBudgets: [{ categoryId: 'c1', monthlyLimit: '100', warningThresholdPercent: 80, updatedAt: 1 }] }),
    );
  });

  it('refuses a malformed recurring template instead of dropping it', () => {
    expectInvalid('recurringTemplates[0]', () =>
      templates({ recurringTemplates: [{ id: UUID, amount: null }] }),
    );
  });

  it('refuses a receipt the rules would reject instead of skipping it', () => {
    const valid = {
      id: `${UUID}_2026-01-01`,
      templateId: UUID,
      scheduledDate: '2026-01-01',
      expenseId: 'a'.repeat(64),
      createdAt: 1_700_000_000_000,
    };
    expect(receipts([valid], 'meta.receipts')).toHaveLength(1);
    expectInvalid('createdAt', () => receipts([{ ...valid, createdAt: 0 }], 'meta.receipts'));
    expectInvalid('expenseId', () => receipts([{ ...valid, expenseId: 'nope' }], 'meta.receipts'));
    expectInvalid('id', () => receipts([{ ...valid, id: 'wrong_2026-01-01' }], 'meta.receipts'));
  });
});

describe('safetySnapshot: declared totals and bounds', () => {
  it('refuses a snapshot that declares more rows than were read', () => {
    const declared = declaredCount(meta({ totalExpenses: 5 }), 'totalExpenses');
    const read = expenses(chunkOf([expenseRow()]), 'chunk_0');
    expectInvalid('snapshot declares 5 rows but 1 were read', () => requireCount(declared, read.length, 'meta.totalExpenses'));
  });

  it('ignores an absent declared total and refuses a non-numeric one', () => {
    expect(() => requireCount(null, 3, 'meta.totalExpenses')).not.toThrow();
    expectInvalid('meta.totalExpenses', () => declaredCount({ totalExpenses: 'many' }, 'totalExpenses'));
  });

  it('refuses an unbounded chunk count', () => {
    expectInvalid('chunkCount', () => chunkCount({ chunkCount: 100_000 }, 'chunkCount'));
    expect(chunkCount({}, 'chunkCount')).toBe(1);
    expect(chunkCount({ receiptChunkCount: 0 }, 'receiptChunkCount', 'meta', 0)).toBe(0);
  });

  it('requires the operation id', () => {
    expect(operationId(meta())).toBe('replace_1_abc');
    expectInvalid('operationId', () => operationId({}));
  });

  it('keeps documented preference defaults but rejects writable-invalid values', () => {
    const prefs = preferences({ preferences: { currency: 'EUR' } })!;
    expect(prefs.currency).toBe('EUR');
    expect(prefs.locale).toBe('en');
    expect(prefs.reminderHour).toBe(19);

    expectInvalid('preferences.reminderHour', () =>
      preferences({ preferences: { currency: 'EUR', reminderHour: 25 } }),
    );
    expectInvalid('preferences.currency', () => preferences({ preferences: { currency: 'eur' } }));
  });
});
