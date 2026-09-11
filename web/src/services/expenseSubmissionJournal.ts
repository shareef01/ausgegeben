import type { Expense } from '@/models/types';

const DB_NAME = 'ausgegeben-operations';
const DB_VERSION = 1;
const STORE_NAME = 'pendingExpenseSubmissions';
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

type ExpenseSubmission = Omit<Expense, 'id'>;

interface JournalEntry {
  scope: string;
  uid: string;
  fingerprint: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface PreparedExpenseSubmission {
  scope: string;
  fingerprint: string;
  idempotencyKey: string;
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
        db.createObjectStore(STORE_NAME, { keyPath: 'scope' });
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

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Operation journal request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Operation journal transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Operation journal transaction aborted'));
  });
}

/** Hash the normalized write shape; no note, amount, or category is stored in plaintext. */
export async function expenseSubmissionFingerprint(payload: ExpenseSubmission): Promise<string> {
  const canonical = JSON.stringify([
    payload.amount,
    // Time-of-day is volatile after a reload. Day identity preserves a genuine retry
    // while still separating transactions intentionally entered on different dates.
    Math.floor(payload.dateMillis / 86_400_000),
    payload.categoryId,
    payload.note,
    payload.transactionType,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Atomically find-or-create a key for this account + exact normalized payload.
 * IndexedDB readwrite transactions serialize identical submissions across tabs.
 */
export async function prepareExpenseSubmission(
  uid: string,
  payload: ExpenseSubmission,
): Promise<PreparedExpenseSubmission> {
  const fingerprint = await expenseSubmissionFingerprint(payload);
  const scope = `${uid}:${fingerprint}`;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const existing = await requestResult(store.get(scope)) as JournalEntry | undefined;
    const now = Date.now();
    let idempotencyKey: string;
    if (existing && now - existing.createdAt <= ENTRY_TTL_MS) {
      idempotencyKey = existing.idempotencyKey;
    } else {
      idempotencyKey = crypto.randomUUID();
      store.put({ scope, uid, fingerprint, idempotencyKey, createdAt: now } satisfies JournalEntry);
    }
    await done;
    return { scope, fingerprint, idempotencyKey, durable: true };
  } catch (error) {
    // Storage-disabled/private environments should retain the old ability to save;
    // they lose crash recovery but do not lose the transaction itself.
    console.warn('[expenseSubmissionJournal] IndexedDB unavailable; using memory-only key', error);
    return { scope, fingerprint, idempotencyKey: crypto.randomUUID(), durable: false };
  }
}

/** Clear only the exact key that was acknowledged; never erase a newer concurrent entry. */
export async function completeExpenseSubmission(
  prepared: PreparedExpenseSubmission,
): Promise<void> {
  if (!prepared.durable) return;
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const existing = await requestResult(store.get(prepared.scope)) as JournalEntry | undefined;
  if (existing?.idempotencyKey === prepared.idempotencyKey) store.delete(prepared.scope);
  await done;
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
