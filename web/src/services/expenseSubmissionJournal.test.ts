import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllExpenseSubmissionJournalForTests,
  completeExpenseSubmission,
  expenseSubmissionFingerprint,
  prepareExpenseSubmission,
} from './expenseSubmissionJournal';

const payload = {
  amount: 12.5,
  dateMillis: 1_725_000_000_000,
  categoryId: 'cat-1',
  note: 'coffee',
  transactionType: 'expense' as const,
};

describe('expenseSubmissionJournal', () => {
  beforeEach(async () => {
    await clearAllExpenseSubmissionJournalForTests();
  });

  it('reuses the durable key after a simulated tab/process restart', async () => {
    const first = await prepareExpenseSubmission('alice', payload);
    const afterRestart = await prepareExpenseSubmission('alice', { ...payload });

    expect(first.durable).toBe(true);
    expect(afterRestart.idempotencyKey).toBe(first.idempotencyKey);
    expect(afterRestart.fingerprint).toBe(first.fingerprint);
  });

  it('serializes identical concurrent submissions onto one key', async () => {
    const prepared = await Promise.all(
      Array.from({ length: 10 }, () => prepareExpenseSubmission('alice', payload)),
    );
    expect(new Set(prepared.map((item) => item.idempotencyKey)).size).toBe(1);
  });

  it('scopes journals by account and normalized payload', async () => {
    const original = await prepareExpenseSubmission('alice', payload);
    const changed = await prepareExpenseSubmission('alice', { ...payload, amount: 13 });
    const otherUser = await prepareExpenseSubmission('bob', payload);

    expect(changed.idempotencyKey).not.toBe(original.idempotencyKey);
    expect(otherUser.idempotencyKey).not.toBe(original.idempotencyKey);
  });

  it('rotates the key only after the matching write is acknowledged', async () => {
    const first = await prepareExpenseSubmission('alice', payload);
    await completeExpenseSubmission(first);
    const next = await prepareExpenseSubmission('alice', payload);

    expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('uses every persisted field in the fingerprint', async () => {
    const base = await expenseSubmissionFingerprint(payload);
    const variants = [
      { ...payload, amount: 12.51 },
      { ...payload, dateMillis: payload.dateMillis + 86_400_000 },
      { ...payload, categoryId: 'cat-2' },
      { ...payload, note: 'tea' },
      { ...payload, transactionType: 'income' as const },
    ];
    for (const variant of variants) {
      expect(await expenseSubmissionFingerprint(variant)).not.toBe(base);
    }
  });
});
