const DB_NAME = 'ausgegeben-operations';
const DB_VERSION = 1;
const STORE_NAME = 'pendingExpenseSubmissions';
// Purely a cleanup grace period now — see the module doc comment below. An entry
// younger than this is left alone by reconciliation on the chance its write is still
// in flight; it is never reused to identify a submission, so lengthening or shortening
// this value cannot reintroduce or fix a correctness bug.
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Identity here is a single submission *attempt*, never the semantic contents of an
 * expense. Two transactions with identical amount/category/note/type entered seconds
 * apart are two legitimate, independent records — hashing their content to find-or-reuse
 * a key (the previous design) silently collapsed the second into the first whenever a
 * crash left the first attempt's journal entry uncompleted. See DATA-1.
 *
 * Each explicit call to [beginExpenseSubmission] mints a fresh, random operation id and
 * persists it before Firestore is ever called. A genuine retry of that *same* attempt —
 * a transient-error retry still inside the same save() call, which still holds the
 * `PreparedExpenseSubmission` it already has — simply calls Firestore again with the
 * same id; nothing here needs to be re-consulted for that case, and `insertExpense`'s own
 * transactional "create only if this id's document doesn't already exist" check makes a
 * second attempt with the same id safely idempotent.
 *
 * The remaining gap is a real process/tab death between the Firestore write acknowledging
 * and this module's own `completeExpenseSubmission` running: the durable entry survives,
 * but the in-memory `PreparedExpenseSubmission` (and the original payload, which this
 * journal never stores) does not. [reconcilePendingExpenseSubmissions] closes that gap
 * without ever attempting a write of its own: it only checks whether the operation's
 * document already exists and, if so, forgets the now-redundant bookkeeping. If the
 * write never reached the server, the entry is abandoned after the grace period — the
 * transaction is not silently resubmitted (this module never had the field values to
 * resubmit), but nor can it ever collide with an unrelated, later submission.
 */
interface JournalEntry {
  operationId: string;
  uid: string;
  createdAt: number;
}

export interface PreparedExpenseSubmission {
  operationId: string;
  /** False only when IndexedDB is unavailable; saving may continue memory-only. */
  durable: boolean;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'operationId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open operation journal'));
    request.onblocked = () => reject(new Error('Operation journal open blocked'));
  });
  databasePromise.catch(() => {
    databasePromise = null;
  });
  return databasePromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Operation journal transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Operation journal transaction aborted'));
  });
}

/**
 * Mint and durably persist a fresh operation id for one explicit user submission.
 *
 * Always creates a new id — this function never looks at the expense's field values and
 * never reuses a previous entry, so two calls always identify two distinct operations,
 * even given byte-identical payloads. Callers that need to retry the *same* operation
 * (e.g. a transient-error retry within the same save attempt) must keep the returned
 * `PreparedExpenseSubmission` and reuse it directly rather than calling this again.
 */
export async function beginExpenseSubmission(uid: string): Promise<PreparedExpenseSubmission> {
  const operationId = crypto.randomUUID();
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put({ operationId, uid, createdAt: Date.now() } satisfies JournalEntry);
    await done;
    return { operationId, durable: true };
  } catch (error) {
    // Storage-disabled/private environments should retain the old ability to save;
    // they lose crash recovery but do not lose the transaction itself.
    console.warn('[expenseSubmissionJournal] IndexedDB unavailable; using memory-only key', error);
    return { operationId, durable: false };
  }
}

/** Forget a submission's bookkeeping once its outcome (success or otherwise) is known. */
export async function completeExpenseSubmission(
  prepared: PreparedExpenseSubmission,
): Promise<void> {
  if (!prepared.durable) return;
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).delete(prepared.operationId);
  await done;
}

/**
 * Resolve journal entries left behind by a process/tab death between a Firestore write
 * acknowledging and `completeExpenseSubmission` running.
 *
 * For each pending entry, `exists` is asked whether that exact operation's document is
 * already present server-side. If so, the write already succeeded — the entry is only
 * bookkeeping now and is removed. This function never attempts a write itself: it cannot
 * resubmit a transaction whose write never reached the server (the original field values
 * were deliberately never persisted here), so such an entry is left alone until it ages
 * past the cleanup grace period, then dropped. Either outcome is safe: a genuinely new,
 * later submission always mints its own fresh id via `beginExpenseSubmission` and can
 * never be matched against — let alone collapsed into — a leftover entry from here.
 */
export async function reconcilePendingExpenseSubmissions(
  uid: string,
  exists: (operationId: string) => Promise<boolean>,
): Promise<void> {
  try {
    const db = await openDatabase();
    const entries: JournalEntry[] = [];
    const readTransaction = db.transaction(STORE_NAME, 'readonly');
    const cursorRequest = readTransaction.objectStore(STORE_NAME).openCursor();
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        const entry = cursor.value as JournalEntry;
        if (entry.uid === uid) entries.push(entry);
        cursor.continue();
      };
    });
    await transactionDone(readTransaction);

    for (const entry of entries) {
      const alreadyWritten = await exists(entry.operationId).catch(() => false);
      const stale = Date.now() - entry.createdAt > ENTRY_TTL_MS;
      if (!alreadyWritten && !stale) continue; // may still be genuinely in flight; leave it

      const writeTransaction = db.transaction(STORE_NAME, 'readwrite');
      const done = transactionDone(writeTransaction);
      writeTransaction.objectStore(STORE_NAME).delete(entry.operationId);
      await done;
    }
  } catch (error) {
    console.warn('[expenseSubmissionJournal] reconciliation failed', error);
  }
}

/** Account sign-out abandons opaque pending submissions for that account. */
export async function clearExpenseSubmissionJournal(uid: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const cursorRequest = store.openCursor();
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        if ((cursor.value as JournalEntry).uid === uid) cursor.delete();
        cursor.continue();
      };
    });
    await done;
  } catch (error) {
    console.warn('[expenseSubmissionJournal] could not clear account journal', error);
  }
}

export async function clearAllExpenseSubmissionJournalForTests(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).clear();
  await done;
}
