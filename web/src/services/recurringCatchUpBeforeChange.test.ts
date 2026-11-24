import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringTemplate } from './recurrence';

const reconcile = vi.fn();
const getAll = vi.fn();
vi.mock('@/services/recurringRepository', () => ({
  recurringRepository: {
    reconcile: (...a: unknown[]) => reconcile(...a),
    getAll: (...a: unknown[]) => getAll(...a),
    getRecurringIssues: () => [],
    catchUpIncomplete: () => false,
  },
}));

const { syncRecurring, catchUpBeforeChange, onlyCaughtUp } = await import('@/services/recurringStore');
const { useAuthStore } = await import('@/services/authStore');
const { localDateAt } = await import('@/services/recurrence');

const zone = 'UTC';
const today = () => localDateAt(Date.now(), zone);
const template = (over: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: 't1', amount: 12, categoryId: 'c1', note: 'Rent', transactionType: 'expense',
  frequency: 'monthly', interval: 1, startDate: today(), endDate: null, timeZone: zone,
  enabled: true, nextIndex: 0, nextDate: today(), createdAt: 1, updatedAt: 10, ...over,
});

/** A reconcile call that stays open until the test resolves it. */
function heldPass() {
  let release!: () => void;
  reconcile.mockImplementationOnce(() => new Promise<number>(r => { release = () => r(0); }));
  return () => release();
}

describe('catch-up requested while a pass is running', () => {
  beforeEach(() => {
    reconcile.mockReset();
    reconcile.mockResolvedValue(0);
    getAll.mockReset();
    useAuthStore.setState({ user: { uid: 'u1', email: null, displayName: null, emailVerified: true } });
  });

  it('runs one more pass after the running one, shared by every caller meanwhile', async () => {
    const release = heldPass();
    const first = syncRecurring();
    await Promise.resolve();
    // A template saved now is not in the running pass's read, so these must not just join it.
    const second = syncRecurring();
    const third = syncRecurring();
    expect(reconcile).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, third]);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('records a charge due today before a change and returns the caught-up copy', async () => {
    const caughtUp = template({ nextIndex: 1, nextDate: '2999-01-01', updatedAt: 11 });
    getAll.mockResolvedValue([caughtUp]);
    await expect(catchUpBeforeChange('u1', template())).resolves.toEqual(caughtUp);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(onlyCaughtUp(caughtUp, template())).toBe(true);
    expect(onlyCaughtUp({ ...caughtUp, amount: 13 }, template())).toBe(false);
  });

  it('leaves paused and not-yet-due templates alone', async () => {
    const paused = template({ enabled: false });
    const later = template({ nextDate: '2999-01-01' });
    await expect(catchUpBeforeChange('u1', paused)).resolves.toBe(paused);
    await expect(catchUpBeforeChange('u1', later)).resolves.toBe(later);
    expect(reconcile).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('reports a template deleted meanwhile as gone', async () => {
    getAll.mockResolvedValue([]);
    await expect(catchUpBeforeChange('u1', template())).resolves.toBeNull();
  });
});
