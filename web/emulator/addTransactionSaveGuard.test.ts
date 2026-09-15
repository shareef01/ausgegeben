import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emulatorFirestore,
  resetHarness,
  signInTestUser,
  startHarness,
  stopHarness,
  TEST_UID,
} from './harness';

// Point the repository's Firestore accessor at the emulator instance, matching the
// pattern used by expenseSubmissionReconciliation.test.ts.
vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');
const journal = await import('@/services/expenseSubmissionJournal');
const { runExclusive, writeExpense } = await import('@/viewmodels/useAddTransactionViewModel');

/**
 * B2 end-to-end regression: `runExclusive` (save()'s synchronous re-entrancy guard)
 * and `writeExpense` (save()'s real write path) — the exact functions the hook calls
 * — running against a real Firestore emulator, not a re-implementation of either.
 *
 * These deliberately live alongside the DATA-1 reconciliation suite rather than
 * inside it: DATA-1 proves operation identity is correct once a write is attempted;
 * B2 proves an *overlapping* attempt is rejected before it ever reaches that point,
 * without reintroducing anything content-based — a later, sequential identical save
 * must still succeed (Test 4 guards exactly that boundary).
 */
describe('B2: overlapping save() invocations are rejected without a content-based guard', () => {
  let categoryId: string;

  beforeAll(startHarness);
  afterAll(stopHarness);
  beforeEach(async () => {
    await resetHarness();
    await journal.clearAllExpenseSubmissionJournalForTests();
    signInTestUser();
    categoryId = await expenseRepository.insertCategory({
      name: 'Coffee',
      iconName: 'coffee',
      colorInt: 1,
      transactionType: 'expense',
      sortOrder: 0,
    });
  });

  const draft = () => ({
    amount: 4.5,
    categoryId,
    note: '',
    dateMillis: Date.UTC(2026, 8, 14, 9, 0, 0),
    transactionType: 'expense' as const,
  });

  it('Test 1: two overlapping calls on one guard create only one operation id and one document', async () => {
    const guardRef = { current: false };
    const beginSpy = vi.spyOn(journal, 'beginExpenseSubmission');

    // Not awaited between calls — both invocations happen in the same synchronous
    // turn, exactly like two Save taps queued before React commits `saving=true`.
    const [first, second] = await Promise.all([
      runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() })),
      runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() })),
    ]);

    // Exactly one of the two logical attempts entered the guard; the other was
    // rejected before it could mint an operation id or call Firestore.
    const outcomes = [first, second];
    const entered = outcomes.filter((o) => o.ok);
    const rejected = outcomes.filter((o) => !o.ok);
    expect(entered).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toEqual({ ok: false, reason: 'overlapping' });

    // beginExpenseSubmission (inside writeExpense) was called exactly once — the
    // rejected invocation never reached it.
    expect(beginSpy).toHaveBeenCalledTimes(1);

    const { items } = await expenseRepository.getAllExpensesCapped();
    expect(items).toHaveLength(1);

    // The guard is released once the winning attempt settles, same as any other
    // completed save — later calls are unaffected (proven fully in Test 2/4).
    expect(guardRef.current).toBe(false);
  });

  it('Test 2: the guard resets after success, so a later save proceeds and gets its own id', async () => {
    const guardRef = { current: false };

    const a = await runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() }));
    expect(a.ok).toBe(true);
    expect(guardRef.current).toBe(false);

    const b = await runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() }));
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value).not.toBe(a.value); // distinct document ids -> distinct operation ids
    }

    const { items } = await expenseRepository.getAllExpensesCapped();
    expect(items).toHaveLength(2);
  });

  it('Test 3: the guard resets after a failure, so a later save is not permanently blocked', async () => {
    const guardRef = { current: false };

    // A real production failure path (writeExpense's own "Not signed in" guard),
    // forced to fire only *after* runExclusive has already claimed the lock.
    await expect(
      runExclusive(guardRef, () => writeExpense({ uid: undefined, payload: draft() })),
    ).rejects.toThrow('Not signed in');
    expect(guardRef.current).toBe(false);

    const b = await runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() }));
    expect(b.ok).toBe(true);

    const { items } = await expenseRepository.getAllExpensesCapped();
    expect(items).toHaveLength(1); // only B's document — A never wrote anything
  });

  it('Test 4: two sequential identical transactions after completion both persist (no content-based dedupe)', async () => {
    const guardRef = { current: false };

    const a = await runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() }));
    // A has fully settled — this is a distinct, later explicit save, not an overlap.
    const b = await runExclusive(guardRef, () => writeExpense({ uid: TEST_UID, payload: draft() }));

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).not.toBe(b.value);
    }

    const { items } = await expenseRepository.getAllExpensesCapped();
    expect(items).toHaveLength(2); // both legitimate, identical-content transactions exist
  });
});
