import { describe, expect, it } from 'vitest';
import {
  RESTORE_REVISION_LEAD_MARGIN_MS,
  RESTORE_REVISION_MAX_LEAD_MS,
  restoredExpenseRevision,
  storedExpenseRevision,
} from '@/services/restoreExpenseBatch';

describe('restoredExpenseRevision', () => {
  it('uses the clock when the stored revision is in the past', () => {
    expect(restoredExpenseRevision(1_000, null)).toBe(1_000);
    expect(restoredExpenseRevision(1_000, 999)).toBe(1_000);
    expect(restoredExpenseRevision(1_000, 1_000)).toBe(1_001);
  });

  it('steps over a stored revision a fast clock left in the future', () => {
    expect(restoredExpenseRevision(1_000, 301_000)).toBe(301_001);
  });

  it('ignores a non-finite stored revision rather than writing NaN', () => {
    expect(restoredExpenseRevision(1_000, Number.NaN)).toBe(1_000);
    expect(restoredExpenseRevision(1_000, Number.POSITIVE_INFINITY)).toBe(1_000);
  });

  it('keeps the retry inside the rules five-minute window', () => {
    const now = 1_000_000;
    // A row stored at the very edge of the window cannot be stepped over legally; the
    // caller refuses with EXPENSE_REVISION_UNWRITABLE instead of retrying into a rejection.
    const edge = now + RESTORE_REVISION_MAX_LEAD_MS;
    expect(restoredExpenseRevision(now, edge) - now).toBeGreaterThan(
      RESTORE_REVISION_MAX_LEAD_MS - RESTORE_REVISION_LEAD_MARGIN_MS,
    );
  });
});

describe('storedExpenseRevision', () => {
  it('reads the millisecond number current clients write', () => {
    expect(storedExpenseRevision(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('reads a legacy Firestore Timestamp', () => {
    const stamp = { toMillis: () => 1_700_000_000_000 };
    expect(storedExpenseRevision(stamp)).toBe(1_700_000_000_000);
  });

  it('returns null for a row with no usable revision', () => {
    expect(storedExpenseRevision(undefined)).toBeNull();
    expect(storedExpenseRevision(null)).toBeNull();
    expect(storedExpenseRevision('1700000000000')).toBeNull();
    expect(storedExpenseRevision({ toMillis: 'nope' })).toBeNull();
  });
});
