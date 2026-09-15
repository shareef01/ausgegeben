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
// pattern used by ../emulator/expenseRepository.test.ts.
vi.mock('@/services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/firebase')>();
  const { emulatorFirestore: db } = await import('./harness');
  return { ...actual, getFirebaseFirestore: () => db() };
});

const { expenseRepository } = await import('@/repositories/expenseRepository');
const {
  beginExpenseSubmission,
  clearAllExpenseSubmissionJournalForTests,
  completeExpenseSubmission,
} = await import('@/services/expenseSubmissionJournal');

/**
 * DATA-1 end-to-end regression: the journal's identity fix, `insertExpense`'s
 * transactional create-if-absent guard, and `ensureSeeded`'s reconciliation pass all
 * working together against a real Firestore emulator — not mocks.
 */
describe('DATA-1: submission identity and crash reconciliation', () => {
  let categoryId: string;

  beforeAll(startHarness);
  afterAll(stopHarness);
  beforeEach(async () => {
    await resetHarness();
    await clearAllExpenseSubmissionJournalForTests();
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

  it('Case 1: two back-to-back identical transactions both get persisted', async () => {
    const a = await beginExpenseSubmission(TEST_UID);
    const idA = await expenseRepository.insertExpense(draft(), a.operationId);
    await completeExpenseSubmission(a);

    const b = await beginExpenseSubmission(TEST_UID);
    const idB = await expenseRepository.insertExpense({ ...draft(), dateMillis: draft().dateMillis + 3600_000 }, b.operationId);
    await completeExpenseSubmission(b);

    expect(idB).not.toBe(idA);
    const { items: all } = await expenseRepository.getAllExpensesCapped();
    expect(all).toHaveLength(2);
  });

  it('Case 2: retrying the same in-flight operation id creates only one document', async () => {
    const a = await beginExpenseSubmission(TEST_UID);
    const first = await expenseRepository.insertExpense(draft(), a.operationId);
    // Simulate a transient-error retry within the same save attempt: the caller still
    // holds `a` and calls insertExpense again with the same operation id.
    const retried = await expenseRepository.insertExpense(draft(), a.operationId);

    expect(retried).toBe(first);
    const { items: all } = await expenseRepository.getAllExpensesCapped();
    expect(all).toHaveLength(1);
  });

  it('Case 3: crash after the server write reconciles without creating a duplicate', async () => {
    const a = await beginExpenseSubmission(TEST_UID);
    await expenseRepository.insertExpense(draft(), a.operationId);
    // Simulate the crash: completeExpenseSubmission(a) never runs, so the journal
    // entry for `a` survives into the next "app start".

    // The next sign-in runs ensureSeeded(), which reconciles pending submissions.
    await expenseRepository.ensureSeeded();

    const { items: all } = await expenseRepository.getAllExpensesCapped();
    expect(all).toHaveLength(1); // reconciliation must not have written a second copy

    // The reconciled entry must be gone: a fresh submission must not find or reuse it.
    const b = await beginExpenseSubmission(TEST_UID);
    expect(b.operationId).not.toBe(a.operationId);
  });

  it('Case 4: a new identical submission after recovery still creates its own record', async () => {
    const crashed = await beginExpenseSubmission(TEST_UID);
    await expenseRepository.insertExpense(draft(), crashed.operationId);
    await expenseRepository.ensureSeeded(); // reconciles the crashed operation

    const b = await beginExpenseSubmission(TEST_UID);
    const idB = await expenseRepository.insertExpense(draft(), b.operationId);
    await completeExpenseSubmission(b);

    expect(idB).toBeTruthy();
    const { items: all } = await expenseRepository.getAllExpensesCapped();
    expect(all).toHaveLength(2); // the crashed transaction and the new one both exist
  });
});
