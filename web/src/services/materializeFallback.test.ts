import { describe, expect, it } from 'vitest';
import { materializeFallbackAcceptance } from '@/services/recurringRepository';
import { occurrenceKey, type RecurringTemplate } from '@/services/recurrence';

const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const DATE = '2024-01-31';
const KEY = occurrenceKey(TEMPLATE_ID, DATE);
const EXPENSE_ID = 'a'.repeat(64); // stands in for sha256(KEY)

const template = (over: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: TEMPLATE_ID,
  amount: 15,
  categoryId: 'cat-food',
  note: 'Rent',
  transactionType: 'expense',
  frequency: 'monthly',
  interval: 1,
  startDate: '2024-01-31',
  endDate: null,
  timeZone: 'Europe/Berlin',
  enabled: true,
  nextIndex: 0,
  nextDate: DATE,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const receipt = (expenseId: string) => ({
  exists: () => true,
  data: () => ({ templateId: TEMPLATE_ID, scheduledDate: DATE, expenseId }),
});

describe('materializeFallbackAcceptance — the real fallback acceptance rule', () => {
  it('accepts a server-confirmed advance with a valid canonical receipt (B1)', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(
      materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt(EXPENSE_ID), EXPENSE_ID, fresh),
    ).toBe(true);
  });

  it('rejects an invalid receipt even when the template advanced (B2)', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(
      materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt('b'.repeat(64)), EXPENSE_ID, fresh),
    ).toBe(false);
  });

  it('rejects a receipt that names another template or date', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    const otherTemplate = { ...receipt(EXPENSE_ID), data: () => ({ templateId: 'other', scheduledDate: DATE, expenseId: EXPENSE_ID }) };
    expect(materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, otherTemplate, EXPENSE_ID, fresh)).toBe(false);
  });

  it('never accepts without a cursor advance (no unauthorized cursor movement)', () => {
    const fresh = template({ nextIndex: 0, nextDate: DATE, updatedAt: 2 });
    expect(materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt(EXPENSE_ID), EXPENSE_ID, fresh)).toBe(false);
  });

  it('never accepts when the revision did not increase', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 1 });
    expect(materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt(EXPENSE_ID), EXPENSE_ID, fresh)).toBe(false);
  });

  it('never accepts a missing template (B3: the original error must propagate)', () => {
    expect(materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt(EXPENSE_ID), EXPENSE_ID, null)).toBe(false);
  });

  it('does not accept the raw occurrence key in place of its hash', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(
      materializeFallbackAcceptance(TEMPLATE_ID, { date: DATE, revision: 1 }, receipt(KEY.slice(0, 64)), EXPENSE_ID, fresh),
    ).toBe(false);
  });
});
