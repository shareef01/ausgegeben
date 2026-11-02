import {
  collection,
  doc,
  documentId,
  getDocsFromServer,
  query,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import { EXPENSES_COLLECTION } from '@/repositories/firestorePaths';

/**
 * Restore writes an expense with a fresh `updatedAt`, but `firestore.rules` refuses any
 * expense write whose revision is older than the stored row
 * (`monotonicallyIncreasingExpenseUpdatedAt`). A stored row may legitimately sit up to five
 * minutes *ahead* of the restoring device's clock: `validUpdatedAt` accepts that skew, and a
 * device whose clock ran fast produces it. Every restore path wrote `Date.now()`, so such a
 * row refused the whole batch — after earlier batches had already committed — and the user was
 * left with a half-restored account behind a bare PERMISSION_DENIED (AUD-006).
 *
 * The file cannot answer the question (it carries the revision from export time, not what is
 * stored now), so the fix reconciles *after* a refusal instead of reading on every write: an
 * ordinary restore still costs exactly the writes it always did, and only a batch the rules
 * rejected pays to read its own documents back.
 */

/** Firestore accepts at most 30 values in an `in` filter. */
export const RESTORE_REVISION_QUERY_LIMIT = 30;

/** `updatedAt` this far ahead of the server clock is refused by firestore.rules. */
export const RESTORE_REVISION_MAX_LEAD_MS = 300_000;

/** Margin kept under that window when the retry has to write ahead. */
export const RESTORE_REVISION_LEAD_MARGIN_MS = 5_000;

/**
 * Revision a restore may write over a row whose stored revision is `stored`.
 *
 * The rules want `>=`, so a stored value ahead of the clock has to be stepped over rather
 * than replaced: writing `stored` again is legal but leaves the row's ordering ambiguous for
 * whoever writes it next.
 */
export function restoredExpenseRevision(now: number, stored: number | null): number {
  return stored !== null && Number.isFinite(stored) && stored >= now ? stored + 1 : now;
}

/**
 * A stored expense revision, whether it is the millisecond number current clients write or
 * the Firestore `Timestamp` builds before that wrote (firestore.rules keeps both writable).
 */
export function storedExpenseRevision(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const millis = (toMillis as () => unknown).call(value);
      if (typeof millis === 'number' && Number.isFinite(millis)) return millis;
    }
  }
  return null;
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'permission-denied'
  );
}

export interface RestoredExpenseWrite {
  id: string;
  /** Allowlisted restore payload; the commit adds `updatedAt` itself. */
  payload: Record<string, unknown>;
}

export interface RestoreExpenseFaultHooks {
  /**
   * Runs after the stored revisions were read back and before the single retry commits.
   * Same purpose as `ReplaceFaultHooks`: lets an emulator test put a concurrent write between
   * the lookup and the retry, which nothing else can interleave deterministically.
   */
  beforeRetry?: (stored: ReadonlyMap<string, number>) => Promise<void> | void;
}

export interface CommitRestoredExpensesOptions {
  /** `merge: false` is the rollback path's full overwrite. Defaults to a merge upsert. */
  merge?: boolean;
  /**
   * Adds writes to the same atomic batch — the journalled replace flow puts its
   * restore-operation/lease update beside the expenses, and a retry must keep that pairing
   * rather than commit expenses without their journal progress.
   */
  patchBatch?: (batch: WriteBatch) => void;
  faultHooks?: RestoreExpenseFaultHooks;
}

/**
 * Stored expense revisions, read from the server rather than the cache: the retry exists
 * because the stored value is unknown, and a stale cached copy would answer wrongly.
 */
export async function readStoredExpenseRevisions(
  db: Firestore,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const revisions = new Map<string, number>();
  for (let i = 0; i < ids.length; i += RESTORE_REVISION_QUERY_LIMIT) {
    const page = ids.slice(i, i + RESTORE_REVISION_QUERY_LIMIT);
    const snap = await getDocsFromServer(
      query(
        collection(db, 'users', userId, EXPENSES_COLLECTION),
        where(documentId(), 'in', page as string[]),
      ),
    );
    for (const stored of snap.docs) {
      const revision = storedExpenseRevision(stored.data().updatedAt);
      if (revision !== null) revisions.set(stored.id, revision);
    }
  }
  return revisions;
}

/**
 * Commits one batch of restored expenses, reconciling the one refusal the backup file cannot
 * predict: a stored revision ahead of this device's clock.
 *
 * The first attempt is exactly what the restore wrote before. A batch commits entirely or not
 * at all, so a refused attempt wrote nothing; the stored revisions are then read back and the
 * batch — expenses plus whatever `patchBatch` adds, journal and lease included — is retried
 * once with only the offending rows stepped over their stored value. Rows that were already
 * writable keep the plain clock revision, so the retry cannot plant future timestamps on
 * documents that never needed them.
 *
 * A stored revision the retry cannot safely step past throws `EXPENSE_REVISION_UNWRITABLE` — the
 * same refuse-clinically shape preferences use — instead of a bare PERMISSION_DENIED. That is the
 * application's conservative margin (`now + 295 s`, five seconds under the rules' window), not a
 * proof that no legal write exists: a revision inside that last margin could in principle be
 * stepped over, but only by betting on this device's clock offset, so the restore declines and
 * the row becomes writable once the margin ages out.
 *
 * Nothing here can turn an authorization failure into a successful write: the retry re-sends
 * the same payload through the same rules, and any refusal the revision bump does not address
 * is re-thrown as the original permission error. Exactly one retry is attempted. A concurrent
 * write that lands *above* the revision the retry is about to write makes the batch fail closed
 * rather than loop; one that lands at or below it is overwritten, because this is an upsert with
 * last-writer-wins semantics, not a compare-and-swap.
 */
export async function commitRestoredExpenses(
  db: Firestore,
  userId: string,
  entries: readonly RestoredExpenseWrite[],
  options: CommitRestoredExpensesOptions = {},
): Promise<void> {
  const merge = options.merge ?? true;
  const now = Date.now();

  const commit = async (revisions: ReadonlyMap<string, number>): Promise<void> => {
    const batch = writeBatch(db);
    for (const entry of entries) {
      batch.set(
        doc(db, 'users', userId, EXPENSES_COLLECTION, entry.id),
        { ...entry.payload, updatedAt: revisions.get(entry.id) ?? now },
        { merge },
      );
    }
    options.patchBatch?.(batch);
    await batch.commit();
  };

  try {
    await commit(new Map());
    return;
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    const stored = await readStoredExpenseRevisions(
      db,
      userId,
      entries.map((entry) => entry.id),
    );
    const bumped = new Map<string, number>();
    const limit = now + RESTORE_REVISION_MAX_LEAD_MS - RESTORE_REVISION_LEAD_MARGIN_MS;
    for (const entry of entries) {
      const revision = stored.get(entry.id);
      if (revision === undefined || revision < now) continue;
      const stepped = restoredExpenseRevision(now, revision);
      if (stepped > limit) throw new Error('EXPENSE_REVISION_UNWRITABLE');
      bumped.set(entry.id, stepped);
    }
    // Refused for a reason the revision bump cannot address (a category staged for deletion, an
    // account-deletion tombstone, a migration in flight): surface the original error rather
    // than a second, identical one.
    if (bumped.size === 0) throw error;
    await options.faultHooks?.beforeRetry?.(stored);
    try {
      await commit(bumped);
    } catch (retryError) {
      // A retry the rules still refuse is the same failure the caller already had; keep the
      // original error (it names the first refusal) and only surface a different cause.
      throw isPermissionDenied(retryError) ? error : retryError;
    }
  }
}
