import { describe, expect, it, vi } from 'vitest';
import {
  removeRecurringWithConflictRetry,
  saveRecurringWithConflictRetry,
  type RecurringConflictRepository,
} from '@/components/recurringConflictRetry';
import type { RecurringTemplate } from '@/services/recurrence';

/**
 * Deterministic cover for the stale-revision retry added in a67be26.
 *
 * The e2e recurring journey proves the happy path end to end but never forces the conflict
 * branch, because the race it guards is a timing accident. Here the conflict is injected by a
 * controlled repository, so every branch is exercised without sleeps or timeout padding.
 */
const owner = 'u1';

function row(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 'tpl-1',
    amount: 25,
    categoryId: 'cat-rent',
    note: 'Rent',
    transactionType: 'expense',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-15',
    endDate: null,
    timeZone: 'Europe/Berlin',
    enabled: true,
    nextIndex: 3,
    nextDate: '2026-07-15',
    createdAt: 1,
    updatedAt: 100,
    ...overrides,
  };
}

const conflict = () => new Error('RECURRING_CONFLICT');

function repository(parts: Partial<RecurringConflictRepository>): RecurringConflictRepository {
  return { save: vi.fn(), remove: vi.fn(), getAll: vi.fn(), ...parts };
}

describe('recurring stale-revision retry', () => {
  it('pause: re-reads the server revision and repeats the same intent once', async () => {
    const stale = row();
    const fresh = row({ updatedAt: 200 });
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);
    const getAll = vi.fn().mockResolvedValue([fresh]);

    await saveRecurringWithConflictRetry(repository({ save, getAll }), owner, stale, false);

    expect(save).toHaveBeenCalledTimes(2);
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getAll).toHaveBeenCalledWith(owner);
    // First attempt: the caller's stale revision and the caller's intent.
    expect(save.mock.calls[0]).toEqual([owner, { ...stale, enabled: false }, 100]);
    // Retry: the server's revision, unchanged intent.
    expect(save.mock.calls[1]).toEqual([owner, { ...fresh, enabled: false }, 200]);
  });

  it('keeps unrelated concurrent changes made by the other writer', async () => {
    const stale = row();
    const fresh = row({ updatedAt: 200, note: 'Rent (edited elsewhere)', amount: 30, categoryId: 'cat-home' });
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);

    await saveRecurringWithConflictRetry(
      repository({ save, getAll: vi.fn().mockResolvedValue([fresh]) }),
      owner,
      stale,
      false,
    );

    // The retry is built from the fresh row, so only `enabled` is ours to change.
    expect(save.mock.calls[1][1]).toMatchObject({
      note: 'Rent (edited elsewhere)',
      amount: 30,
      categoryId: 'cat-home',
      enabled: false,
    });
    expect(save.mock.calls[1][2]).toBe(200);
  });

  it('resume: an enable toggle retries the same way', async () => {
    const stale = row({ enabled: false });
    const fresh = row({ enabled: false, updatedAt: 200 });
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);

    await saveRecurringWithConflictRetry(
      repository({ save, getAll: vi.fn().mockResolvedValue([fresh]) }),
      owner,
      stale,
      true,
    );

    expect(save.mock.calls[1][1]).toMatchObject({ enabled: true });
    expect(save.mock.calls[1][2]).toBe(200);
  });

  it('delete: refreshes the revision and retries once', async () => {
    const stale = row();
    const remove = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);

    await removeRecurringWithConflictRetry(
      repository({ remove, getAll: vi.fn().mockResolvedValue([row({ updatedAt: 200 })]) }),
      owner,
      stale,
    );

    expect(remove.mock.calls).toEqual([
      [owner, 'tpl-1', 100],
      [owner, 'tpl-1', 200],
    ]);
  });

  it('fails closed with the original conflict when the row vanished before the retry', async () => {
    const original = conflict();
    const save = vi.fn().mockRejectedValueOnce(original);

    // A concurrent delete removed it: nothing to re-read, and nothing may be resurrected.
    await expect(
      saveRecurringWithConflictRetry(
        repository({ save, getAll: vi.fn().mockResolvedValue([]) }),
        owner,
        row(),
        false,
      ),
    ).rejects.toBe(original);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('fails closed with the original conflict when the row vanished before a delete retry', async () => {
    const original = conflict();
    const remove = vi.fn().mockRejectedValueOnce(original);

    await expect(
      removeRecurringWithConflictRetry(
        repository({ remove, getAll: vi.fn().mockResolvedValue([]) }),
        owner,
        row(),
      ),
    ).rejects.toBe(original);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not retry a second conflict', async () => {
    const save = vi.fn().mockRejectedValue(conflict());
    const getAll = vi.fn().mockResolvedValue([row({ updatedAt: 200 })]);

    await expect(
      saveRecurringWithConflictRetry(repository({ save, getAll }), owner, row(), false),
    ).rejects.toThrow('RECURRING_CONFLICT');

    expect(save).toHaveBeenCalledTimes(2);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('does not retry a second conflict on delete', async () => {
    const remove = vi.fn().mockRejectedValue(conflict());
    const getAll = vi.fn().mockResolvedValue([row({ updatedAt: 200 })]);

    await expect(
      removeRecurringWithConflictRetry(repository({ remove, getAll }), owner, row()),
    ).rejects.toThrow('RECURRING_CONFLICT');

    expect(remove).toHaveBeenCalledTimes(2);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('never retries a non-conflict failure', async () => {
    for (const message of ['PERMISSION_DENIED', 'AUTH_ACCOUNT_CHANGED', 'INVALID_RECURRING_TEMPLATE']) {
      const failure = new Error(message);
      const save = vi.fn().mockRejectedValue(failure);
      const getAll = vi.fn();

      await expect(
        saveRecurringWithConflictRetry(repository({ save, getAll }), owner, row(), false),
      ).rejects.toBe(failure);
      expect(save).toHaveBeenCalledTimes(1);
      expect(getAll).not.toHaveBeenCalled();
    }
  });

  it('never retries a non-conflict delete failure', async () => {
    const failure = new Error('PERMISSION_DENIED');
    const remove = vi.fn().mockRejectedValue(failure);
    const getAll = vi.fn();

    await expect(
      removeRecurringWithConflictRetry(repository({ remove, getAll }), owner, row()),
    ).rejects.toBe(failure);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(getAll).not.toHaveBeenCalled();
  });

  it('treats a non-Error rejection as non-retryable', async () => {
    // The guard requires `instanceof Error`, so a bare string cannot be mistaken for a conflict.
    const save = vi.fn().mockRejectedValue('RECURRING_CONFLICT');
    const getAll = vi.fn();

    await expect(
      saveRecurringWithConflictRetry(repository({ save, getAll }), owner, row(), false),
    ).rejects.toBe('RECURRING_CONFLICT');
    expect(save).toHaveBeenCalledTimes(1);
    expect(getAll).not.toHaveBeenCalled();
  });

  it('fails closed when the account changed while the retry re-read', async () => {
    const switched = new Error('AUTH_ACCOUNT_CHANGED');
    const save = vi.fn().mockRejectedValueOnce(conflict());
    const getAll = vi.fn().mockRejectedValue(switched);

    await expect(
      saveRecurringWithConflictRetry(repository({ save, getAll }), owner, row(), false),
    ).rejects.toBe(switched);
    // No write may follow a re-read that proved the signed-in account is somebody else.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('scopes every call to the owner it was given', async () => {
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);
    const getAll = vi.fn().mockResolvedValue([row({ updatedAt: 200 })]);

    await saveRecurringWithConflictRetry(repository({ save, getAll }), 'user-a', row(), false);

    expect(save.mock.calls.map((call) => call[0])).toEqual(['user-a', 'user-a']);
    expect(getAll.mock.calls.map((call) => call[0])).toEqual(['user-a']);
  });

  it('retries against the row it was asked about, not another row the re-read returned', async () => {
    const stale = row({ id: 'tpl-1' });
    const other = row({ id: 'tpl-2', updatedAt: 300 });
    const fresh = row({ id: 'tpl-1', updatedAt: 200 });
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);
    const remove = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(undefined);

    await saveRecurringWithConflictRetry(
      repository({ save, getAll: vi.fn().mockResolvedValue([other, fresh]) }),
      owner,
      stale,
      false,
    );
    expect(save.mock.calls[1][1]).toMatchObject({ id: 'tpl-1', enabled: false });
    expect(save.mock.calls[1][2]).toBe(200);

    await removeRecurringWithConflictRetry(
      repository({ remove, getAll: vi.fn().mockResolvedValue([other, fresh]) }),
      owner,
      stale,
    );
    expect(remove.mock.calls[1]).toEqual([owner, 'tpl-1', 200]);
  });

  it('deletes without retrying when the first attempt succeeds', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn();

    await removeRecurringWithConflictRetry(repository({ remove, getAll }), owner, row());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(getAll).not.toHaveBeenCalled();
  });

  it('saves without retrying when the first attempt succeeds', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn();

    await saveRecurringWithConflictRetry(repository({ save, getAll }), owner, row(), false);

    expect(save).toHaveBeenCalledTimes(1);
    expect(getAll).not.toHaveBeenCalled();
  });
});
