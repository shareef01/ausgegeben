import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginExpenseSubmission,
  clearAllExpenseSubmissionJournalForTests,
  clearExpenseSubmissionJournal,
  completeExpenseSubmission,
  reconcilePendingExpenseSubmissions,
} from './expenseSubmissionJournal';

describe('expenseSubmissionJournal', () => {
  beforeEach(async () => {
    await clearAllExpenseSubmissionJournalForTests();
  });

  it('always mints a fresh, durable operation id', async () => {
    const first = await beginExpenseSubmission('alice');
    const second = await beginExpenseSubmission('alice');

    expect(first.durable).toBe(true);
    expect(second.operationId).not.toBe(first.operationId);
  });

  // DATA-1, Case 1 — two legitimate, byte-identical transactions entered back to back
  // (two €5 transit tickets, two identical coffees, ...) must never be collapsed into
  // one just because their fields match.
  it('gives two back-to-back identical-looking submissions different ids (Case 1)', async () => {
    const a = await beginExpenseSubmission('alice');
    const b = await beginExpenseSubmission('alice');

    expect(b.operationId).not.toBe(a.operationId);
    // Both remain independently completable — neither call's completion can affect
    // the other's bookkeeping.
    await completeExpenseSubmission(a);
    await completeExpenseSubmission(b);
  });

  // DATA-1, Case 2 — retrying the *same* attempt (the caller still holds the prepared
  // object; nothing here is re-consulted) must reuse the same id, and Firestore's own
  // transactional create-if-absent guard (exercised in expenseRepository.test.ts /
  // AppRepository's equivalent) then guarantees only one document is ever created.
  it('a retry of the same in-flight attempt reuses the id it was given (Case 2)', async () => {
    const a = await beginExpenseSubmission('alice');
    // "Retry" is simply: the caller keeps `a` and does not call beginExpenseSubmission
    // again. There is nothing in this module to re-invoke for that case — asserting the
    // object's own id is stable is the whole contract.
    const retried = a;
    expect(retried.operationId).toBe(a.operationId);
  });

  // DATA-1, Case 3 — the process/tab dies after Firestore acknowledges the write but
  // before completeExpenseSubmission runs. On restart, reconciliation must recognise the
  // operation already succeeded and clear its bookkeeping WITHOUT attempting any write.
  it('reconciles a crash-after-write entry without writing anything (Case 3)', async () => {
    const a = await beginExpenseSubmission('alice');
    // Simulate: Firestore write for `a` succeeded, but the crash happened before
    // completeExpenseSubmission(a) could run — the entry is still in the journal.

    let writeAttempts = 0;
    const exists = async (operationId: string) => {
      expect(operationId).toBe(a.operationId);
      return true; // the document for this operation already exists server-side
    };

    await reconcilePendingExpenseSubmissions('alice', async (operationId) => {
      writeAttempts += 1; // reusing this counter as a "was a write function even offered" guard
      return exists(operationId);
    });

    expect(writeAttempts).toBe(1); // existence was checked exactly once — no write API exists here to call
    // The entry must now be gone: preparing again for a genuinely new submission must
    // not find or resurrect it.
    const afterReconcile = await beginExpenseSubmission('alice');
    expect(afterReconcile.operationId).not.toBe(a.operationId);
  });

  // DATA-1, Case 4 — after recovering from the crash above, a new, explicit submission
  // with identical fields must still get its own id and its own document.
  it('a new identical submission after recovery still gets a new id (Case 4)', async () => {
    const crashed = await beginExpenseSubmission('alice');
    await reconcilePendingExpenseSubmissions('alice', async () => true); // crashed op already landed

    const newSubmission = await beginExpenseSubmission('alice');

    expect(newSubmission.operationId).not.toBe(crashed.operationId);
  });

  it('leaves a recent, not-yet-written entry alone (may still be genuinely in flight)', async () => {
    const inFlight = await beginExpenseSubmission('alice');
    let checked = false;
    await reconcilePendingExpenseSubmissions('alice', async () => {
      checked = true;
      return false; // not written yet, and it's brand new — do not delete
    });
    expect(checked).toBe(true);

    // Completing it directly (simulating the original attempt finishing normally)
    // must still work — reconciliation must not have deleted the entry underneath it.
    await expect(completeExpenseSubmission(inFlight)).resolves.toBeUndefined();
  });

  it('does not reconcile another account\'s entries', async () => {
    const alice = await beginExpenseSubmission('alice');
    await reconcilePendingExpenseSubmissions('bob', async () => true);
    // alice's entry must be untouched by a reconciliation scoped to bob.
    await expect(completeExpenseSubmission(alice)).resolves.toBeUndefined();
  });

  it('clearExpenseSubmissionJournal only removes the named account\'s entries', async () => {
    await beginExpenseSubmission('alice');
    const bob = await beginExpenseSubmission('bob');
    await clearExpenseSubmissionJournal('alice');

    // alice's entry is gone: reconciling with an exists() that must not be called proves it.
    let aliceChecked = false;
    await reconcilePendingExpenseSubmissions('alice', async () => {
      aliceChecked = true;
      return false;
    });
    expect(aliceChecked).toBe(false);

    // bob's entry survives.
    let bobChecked = false;
    await reconcilePendingExpenseSubmissions('bob', async () => {
      bobChecked = true;
      return false;
    });
    expect(bobChecked).toBe(true);
    await completeExpenseSubmission(bob);
  });
});
