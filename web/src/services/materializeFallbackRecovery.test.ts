import { beforeEach, describe, expect, it } from 'vitest';
import { materializeFallbackRecovery } from '@/services/recurringRepository';
import { useAuthStore } from '@/services/authStore';
import type { RecurringTemplate } from '@/services/recurrence';

const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const DATE = '2024-01-31';
const EXPENSE_ID = 'a'.repeat(64);

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

const validReceipt = () => ({ exists: () => true, data: () => ({ templateId: TEMPLATE_ID, scheduledDate: DATE, expenseId: EXPENSE_ID }) });
const invalidReceipt = () => ({ exists: () => true, data: () => ({ templateId: TEMPLATE_ID, scheduledDate: DATE, expenseId: 'b'.repeat(64) }) });
const absentReceipt = () => ({ exists: () => false, data: () => undefined });

const permissionDenied = { code: 'permission-denied', message: 'denied' };
const networkError = { code: 'unavailable', message: 'offline' };

describe('materializeFallbackRecovery — the real permission-denied catch decision', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { uid: 'u1', email: null, displayName: null, emailVerified: true } });
  });

  it('recovers when a competing client produced a valid canonical receipt', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    const result = materializeFallbackRecovery('u1', TEMPLATE_ID, {
      error: permissionDenied,
      attempted: { date: DATE, revision: 1 },
      fresh,
      receipt: validReceipt(),
      expectedExpenseId: EXPENSE_ID,
    });
    expect(result).toBe(fresh);
  });

  it('never recovers on an invalid receipt (the original permission error must re-throw)', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(materializeFallbackRecovery('u1', TEMPLATE_ID, {
      error: permissionDenied,
      attempted: { date: DATE, revision: 1 },
      fresh,
      receipt: invalidReceipt(),
      expectedExpenseId: EXPENSE_ID,
    })).toBeNull();
  });

  it('never recovers when the receipt is absent', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(materializeFallbackRecovery('u1', TEMPLATE_ID, {
      error: permissionDenied,
      attempted: { date: DATE, revision: 1 },
      fresh,
      receipt: absentReceipt(),
      expectedExpenseId: EXPENSE_ID,
    })).toBeNull();
  });

  it('never treats a non-permission error as a completed occurrence', () => {
    const fresh = template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 });
    expect(materializeFallbackRecovery('u1', TEMPLATE_ID, {
      error: networkError,
      attempted: { date: DATE, revision: 1 },
      fresh,
      receipt: validReceipt(),
      expectedExpenseId: EXPENSE_ID,
    })).toBeNull();
  });

  it('requires a recorded attempt (no attempt, no recovery)', () => {
    expect(materializeFallbackRecovery('u1', TEMPLATE_ID, {
      error: permissionDenied,
      attempted: null,
      fresh: template({ nextIndex: 1, nextDate: '2024-02-29', updatedAt: 2 }),
      receipt: validReceipt(),
      expectedExpenseId: EXPENSE_ID,
    })).toBeNull();
  });
});
