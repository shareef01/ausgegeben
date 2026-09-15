import {
  collection, doc, setDoc, deleteDoc, getDoc, getDocs, getDocsFromServer,
  getDocFromServer, query, where, orderBy, limit,
  onSnapshot, updateDoc, getAggregateFromServer, sum, type Unsubscribe, writeBatch,
  runTransaction, deleteField, type QueryDocumentSnapshot,
  documentId, startAfter,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { t, getLocale, localeTag } from '@/i18n';
import { CategoryValidator, isRulesWritableCategory, type WritableCategoryShape } from '@/utils/categoryValidator';
import type { Category, Expense } from '@/models/types';
import { categoryWritePayload, expenseWritePayload } from '@/utils/firestorePayloads';
import { expenseDocumentId } from '@/utils/idempotency';
import { KeyedSingleFlight } from '@/utils/keyedSingleFlight';
import { reconcilePendingExpenseSubmissions } from '@/services/expenseSubmissionJournal';
import {
  ACCOUNT_DELETION_DOC,
  CATEGORIES_COLLECTION,
  DEDUPE_DOC,
  DELETABLE_USER_COLLECTIONS,
  DELETABLE_USER_DOCS,
  EXPENSES_COLLECTION,
  META_COLLECTION,
} from './firestorePaths';

function uid(): string | null { return useAuthStore.getState().user?.uid ?? null; }
function now() { return Date.now(); }
function fs() { return getFirebaseFirestore(); }
function catCol(u: string) { return collection(fs()!, 'users', u, CATEGORIES_COLLECTION); }
function expCol(u: string) { return collection(fs()!, 'users', u, EXPENSES_COLLECTION); }
function catDoc(u: string, id: string) { return doc(fs()!, 'users', u, CATEGORIES_COLLECTION, id); }
function expDoc(u: string, id: string) { return doc(fs()!, 'users', u, EXPENSES_COLLECTION, id); }
function metaDoc(u: string, id: string) { return doc(fs()!, 'users', u, META_COLLECTION, id); }
/** DEL-1: the one collection-name-to-Firestore-collection-reference mapping deleteAllUserData resolves through the shared registry. */
function collectionRef(u: string, name: string) { return collection(fs()!, 'users', u, name); }

/** Thrown when Firestore rules would reject expense writes for unverified accounts. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedError';
  }
}

/**
 * A category the Firestore rules will refuse, blocking an atomic reorder batch.
 * Carries the offending names so the UI can say which row needs fixing rather than
 * repeating a generic failure the user cannot act on.
 */
export class UnwritableCategoryError extends Error {
  constructor(readonly categoryNames: string) {
    super('UNWRITABLE_CATEGORY');
    this.name = 'UnwritableCategoryError';
  }
}
export class CategoryInUseError extends Error {
  constructor() {
    super('CATEGORY_IN_USE');
    this.name = 'CategoryInUseError';
  }
}

function requireVerifiedEmail(): void {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not signed in');
  if (!user.emailVerified) throw new EmailNotVerifiedError();
}

export const UNCATEGORIZED_ID = '0';
const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

/**
 * Which generation of the orphan sweep has run for an account.
 *
 * Bump this when the sweep's behaviour changes and every existing account should run the
 * new one once. Gating on the *presence* of `orphansScannedAt` — which is what this
 * replaces — has already made a shipped repair permanently unrunnable: the marker was
 * set on every account that had ever cold-started, so the fix could never fire on the
 * long-lived accounts it was written for. A version costs one number and makes that
 * recoverable. Must stay identical to Android's AppRepository.ORPHAN_SCAN_VERSION.
 */
export const ORPHAN_SCAN_VERSION = 1;

/**
 * True when this account has not yet run the current generation of the sweep.
 * Absent version = a pre-versioning marker, so the current sweep has not run.
 */
export function needsOrphanScan(marker: Record<string, unknown> | undefined): boolean {
  if (!marker) return true;
  const version = marker.orphanScanVersion;
  if (typeof version === 'number') return version < ORPHAN_SCAN_VERSION;
  return true;
}

/** Match Android Int colorInts (signed 32-bit) for shared Firestore docs. */
function argb(hex: number): number {
  return hex | 0;
}

/** Same defaults as AppRepository.ensureSeeded() on Android. */
const DEFAULT_CATEGORIES: (t: (k: any) => string) => Omit<Category, 'id'>[] = (t) => [
  { name: t('catGroceries'), iconName: 'shopping_cart', colorInt: argb(0xffe86b5a), transactionType: 'expense', sortOrder: 0 },
  { name: t('catShopping'), iconName: 'shopping_bag', colorInt: argb(0xffe8a060), transactionType: 'expense', sortOrder: 1 },
  { name: t('catDining'), iconName: 'restaurant', colorInt: argb(0xffd4849a), transactionType: 'expense', sortOrder: 2 },
  { name: t('catTransport'), iconName: 'car', colorInt: argb(0xff6a9fd4), transactionType: 'expense', sortOrder: 3 },
  { name: t('catBills'), iconName: 'bolt', colorInt: argb(0xff9a8fd4), transactionType: 'expense', sortOrder: 4 },
  { name: t('catSubscriptions'), iconName: 'subscriptions', colorInt: argb(0xff5ab8aa), transactionType: 'expense', sortOrder: 5 },
  { name: t('catSalary'), iconName: 'credit_card', colorInt: argb(0xff5cb88a), transactionType: 'income', sortOrder: 0 },
  { name: t('catFreelance'), iconName: 'work', colorInt: argb(0xff6a9fd4), transactionType: 'income', sortOrder: 1 },
  { name: t('catRefunds'), iconName: 'undo', colorInt: argb(0xffb8a060), transactionType: 'income', sortOrder: 2 },
  { name: t('catTransfer'), iconName: 'swap_horiz', colorInt: argb(0xff8e8e96), transactionType: 'transfer', sortOrder: 0 },
];

const ensureSeededFlights = new KeyedSingleFlight<string>();

/**
 * Shared result of the all-time scan.
 *
 * The TTL is a floor on how often the most expensive query in the app can run,
 * not a staleness policy: every local write clears the cache outright, so the
 * only thing the window can hide is a change made on another device — which the
 * all-time path never observed anyway, since it is a one-shot fetch with no
 * listener behind it.
 */
const ALL_EXPENSES_CACHE_MS = 30_000;
let allExpensesCache:
  | { uid: string; max: number; at: number; result: { items: Expense[]; truncated: boolean } }
  | null = null;
let allExpensesInFlight:
  | { uid: string; max: number; promise: Promise<{ items: Expense[]; truncated: boolean }> }
  | null = null;

function readAllExpensesCache(userId: string, max: number) {
  if (!allExpensesCache) return null;
  if (allExpensesCache.uid !== userId || allExpensesCache.max !== max) return null;
  if (now() - allExpensesCache.at > ALL_EXPENSES_CACHE_MS) return null;
  return allExpensesCache.result;
}

/** Any write invalidates the scan; sign-out must not leak one account's rows into the next. */
export function invalidateAllExpensesCache() {
  allExpensesCache = null;
  allExpensesInFlight = null;
}

/** Notify UI listeners after writes (Insights / all-time one-shot refetch). */
function emitDataChanged() {
  // Order matters: listeners refetch synchronously on this event, so the cache
  // has to be dropped first or they would be served the pre-write snapshot.
  invalidateAllExpensesCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
}

/** 2-decimal precision for financial data */
function roundAmount(amt: number) { return Math.round(amt * 100) / 100; }

/**
 * SECURE: Guarantee the Uncategorized sentinel category (id '0') exists before anything
 * reassigns expenses to it. Mirrors Android's AppRepository.ensureUncategorizedCategory().
 */
async function ensureUncategorizedCategory(userId: string): Promise<void> {
  const ref = catDoc(userId, UNCATEGORIZED_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if (snap.data().deletionState === 'deleting') {
      await updateDoc(ref, { deletionState: deleteField(), updatedAt: now() });
    }
    return;
  }
  await setDoc(ref, categoryWritePayload({
    id: UNCATEGORIZED_ID,
    name: t('recordUnknownCategory'),
    iconName: 'help_outline',
    colorInt: argb(0xff8e8e96),
    transactionType: 'expense',
    sortOrder: 999,
  }, now()));
}

/**
 * Firestore equality is type-sensitive. Older Android builds stored categoryId as a
 * number; UUID migration stores strings. Match both so delete/dedupe never miss
 * legacy rows (Android AppRepository.expenseDocsForCategory parity).
 */
async function expenseDocsForCategory(
  userId: string,
  categoryId: string,
): Promise<QueryDocumentSnapshot[]> {
  const byString = await getDocs(query(expCol(userId), where('categoryId', '==', categoryId)));
  const asNumber = Number(categoryId);
  const byNumber =
    Number.isFinite(asNumber) && String(asNumber) === categoryId
      ? await getDocs(query(expCol(userId), where('categoryId', '==', asNumber)))
      : null;
  const seen = new Set<string>();
  const out: QueryDocumentSnapshot[] = [];
  for (const d of [...byString.docs, ...(byNumber?.docs ?? [])]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/** Firestore caps a batch at 500 writes; leave headroom like the original callers did. */
const REASSIGN_CHUNK_SIZE = 450;

/**
 * Point a set of expenses at `targetCategoryId`, chunked, tolerating documents the
 * rules refuse. Returns how many could not be reassigned.
 *
 * Two failure modes this exists to survive, both found by the emulator tests:
 *
 *  - deleteCategory committed every linked expense in a single batch with no
 *    chunking at all, so deleting a category with 501+ transactions blew the
 *    500-write cap and failed outright.
 *  - A batch commits all or nothing. One legacy row carrying a field that
 *    validExpense's allowlist no longer permits therefore took its entire chunk
 *    down with it — measured: three healthy orphans, one bad one, zero repaired.
 *    Worse, sweepOrphanedExpenses only records the sweep on success, so such an
 *    account re-read its whole expenses collection on every cold start forever,
 *    which is precisely what the marker was introduced to stop.
 *
 * The batch stays the fast path. When one is rejected its chunk is retried a
 * document at a time so healthy rows still land, and the unfixable ones are
 * counted rather than thrown: a row the rules will never accept must not keep
 * blocking the ones they will.
 */
async function reassignExpenses(
  docs: QueryDocumentSnapshot[],
  targetCategoryId: string,
): Promise<number> {
  let unfixable = 0;
  for (let i = 0; i < docs.length; i += REASSIGN_CHUNK_SIZE) {
    const chunk = docs.slice(i, i + REASSIGN_CHUNK_SIZE);
    const batch = writeBatch(fs()!);
    chunk.forEach((d) => batch.update(d.ref, { categoryId: targetCategoryId }));
    try {
      await batch.commit();
    } catch (error) {
      // A rules-rejected legacy row poisons an otherwise healthy atomic batch. Retry
      // only that known permanent failure one document at a time. Network, auth, quota,
      // and unknown failures remain fatal so category deletion cannot strand references.
      if (!isPermissionDenied(error)) throw error;
      for (const item of chunk) {
        try {
          await updateDoc(item.ref, { categoryId: targetCategoryId });
        } catch (itemError) {
          if (!isPermissionDenied(itemError)) throw itemError;
          unfixable += 1;
        }
      }
    }
  }
  return unfixable;
}

/** Resume Android-originated category type migrations on either client. */
async function resumeCategoryTypeMigrations(userId: string): Promise<void> {
  const categories = await getDocs(catCol(userId));
  for (const category of categories.docs) {
    const data = category.data();
    const target = data.pendingTransactionType;
    if (data.migrationState !== 'migrating' ||
        !['expense', 'income', 'transfer'].includes(target) ||
        target === data.transactionType) {
      continue;
    }
    const linked = await expenseDocsForCategory(userId, category.id);
    let unfixable = 0;
    for (let i = 0; i < linked.length; i += REASSIGN_CHUNK_SIZE) {
      const chunk = linked.slice(i, i + REASSIGN_CHUNK_SIZE);
      const batch = writeBatch(fs()!);
      chunk.forEach((expense) => batch.update(expense.ref, { transactionType: target }));
      try {
        await batch.commit();
      } catch (error) {
        if (!isPermissionDenied(error)) throw error;
        for (const expense of chunk) {
          try {
            await updateDoc(expense.ref, { transactionType: target });
          } catch (itemError) {
            if (!isPermissionDenied(itemError)) throw itemError;
            unfixable += 1;
          }
        }
      }
    }
    if (unfixable > 0) {
      throw new Error(`CATEGORY_TYPE_MIGRATION_BLOCKED:${category.id}:${unfixable}`);
    }
    await runTransaction(fs()!, async (transaction) => {
      const latest = (await transaction.get(category.ref)).data();
      if (!latest) throw new Error(`CATEGORY_NOT_FOUND:${category.id}`);
      if (latest.migrationState === 'migrating' &&
          latest.pendingTransactionType === target &&
          latest.transactionType === data.transactionType) {
        transaction.update(category.ref, {
          transactionType: target,
          migrationState: deleteField(),
          pendingTransactionType: deleteField(),
          updatedAt: now(),
        });
      } else if (latest.migrationState === 'migrating' || latest.transactionType !== target) {
        throw new Error(`CATEGORY_TYPE_MIGRATION_CONFLICT:${category.id}`);
      }
    });
  }
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied';
}

async function deleteCategoryInto(userId: string, id: string, targetId?: string): Promise<void> {
  const source = catDoc(userId, id);
  await setDoc(source, { deletionState: 'deleting', updatedAt: now() }, { merge: true });
  try {
    let linked = await expenseDocsForCategory(userId, id);
    if (!targetId) {
      if (linked.length > 0) throw new CategoryInUseError();
    } else {
      if (linked.length > 0) {
        if (targetId === UNCATEGORIZED_ID) await ensureUncategorizedCategory(userId);
        await reassignExpenses(linked, targetId);
      }
      linked = await expenseDocsForCategory(userId, id);
      if (linked.length > 0) throw new CategoryInUseError();
    }
    await deleteDoc(source);
  } catch (error) {
    // Recovery is identity-safe: only this source document is reopened. If the cleanup
    // itself cannot reach Firestore, the next delete resumes from `deleting`.
    try {
      await updateDoc(source, { deletionState: deleteField(), updatedAt: now() });
    } catch {
      // Preserve the original failure. A stranded barrier is resumable by retrying delete.
    }
    throw error;
  }
}

/** Prefer lowest sortOrder, then id (Android CategoryDedupe parity). */
export function pickDedupeMaster(group: Category[]): Category {
  if (group.length === 0) throw new Error('dedupe group must not be empty');
  return [...group].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export const expenseRepository = {

  /**
   * One-shot soft-capped expense fetch for Insights all-time / CSV export.
   * Prefer onExpensesInRange for live UI — unbounded listeners burn Spark quota.
   * `truncated` is true when more docs exist beyond `max`.
   *
   * Results are shared (see allExpensesCache): Record and Insights each call this
   * independently, and both refetch on ausgegeben:data-changed, so with both
   * mounted a single save could trigger four full scans of up to 5,000 documents
   * each. Spark allows 50,000 reads a day in total.
   */
  async getAllExpensesCapped(max = 5_000): Promise<{ items: Expense[]; truncated: boolean }> {
    const u = uid();
    if (!u) return { items: [], truncated: false };

    const cached = readAllExpensesCache(u, max);
    if (cached) return cached;

    // Share one network round-trip between concurrent callers rather than
    // letting each mounted view start its own.
    if (allExpensesInFlight && allExpensesInFlight.uid === u && allExpensesInFlight.max === max) {
      return allExpensesInFlight.promise;
    }

    const promise = (async () => {
      const snap = await getDocs(query(expCol(u), orderBy('dateMillis', 'desc'), limit(max + 1)));
      const truncated = snap.docs.length > max;
      const docs = truncated ? snap.docs.slice(0, max) : snap.docs;
      if (truncated) {
        console.warn(`[expenseRepository] getAllExpenses capped at ${max} rows`);
      }
      const result = {
        items: docs
          .map((d) => ({ ...d.data(), id: d.id } as Expense))
          .filter((e) => e.deleted !== true),
        truncated,
      };
      allExpensesCache = { uid: u, max, at: now(), result };
      return result;
    })();

    allExpensesInFlight = { uid: u, max, promise };
    try {
      return await promise;
    } finally {
      if (allExpensesInFlight?.promise === promise) allExpensesInFlight = null;
    }
  },

  async getAllCategories(): Promise<Category[]> {
    const userId = uid(); if (!userId) return [];
    const snap = await getDocs(query(catCol(userId), orderBy('sortOrder')));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Category));
  },

  /**
   * Seed default categories when the user's collection is empty (mirrors Android).
   * If categories already exist, runs dedupe only — never re-seeds.
   */
  async ensureSeeded(): Promise<void> {
    const userId = uid();
    if (!userId || !fs()) return;
    try {
      requireVerifiedEmail();
    } catch {
      return;
    }
    await ensureSeededFlights.run(userId, async () => {
      try {
        // Never re-seed while deletion is pending. Retrying deletion is the
        // only safe exit from a potentially partial destructive operation.
        if (await expenseRepository.isAccountDeletionPending()) {
          console.warn('[ensureSeeded] skipped: account deletion incomplete');
          return;
        }
        // A process/tab may have died between a submission's Firestore write landing
        // and its journal entry being cleared. Reconcile rather than resubmit: this
        // never attempts a write, so it can only ever forget bookkeeping for an
        // operation that already succeeded, never collide with a later, unrelated
        // submission. See DATA-1.
        try {
          await reconcilePendingExpenseSubmissions(userId, async (operationId) => {
            const id = await expenseDocumentId(operationId);
            return (await getDoc(expDoc(userId, id))).exists();
          });
        } catch (err) {
          console.warn('[ensureSeeded] pending submission reconciliation failed', err);
        }
        const markerRef = metaDoc(userId, DEDUPE_DOC);
        const marker = (await getDoc(markerRef)).data();
        // Android is the only UI that starts category type changes, but either client
        // must be able to finish one after the initiating process dies.
        await resumeCategoryTypeMigrations(userId);
        const snap = await getDocs(catCol(userId));
        // Dedupe and the orphan sweep are both full-collection reads — by far the most
        // expensive thing this app does. Each runs at most once per account rather than
        // on every cold start / sign-in, and the sweep is skipped when dedupe just ran it.
        // Manual calls to deduplicateCategories() (e.g. CategoriesView's "Deduplicate"
        // button) bypass these markers entirely since they call the function directly.
        let sweptNow = false;
        if (snap.empty) {
          const ts = now();
          await Promise.all(
            DEFAULT_CATEGORIES(t).map(async (cat) => {
              const id = crypto.randomUUID();
              await setDoc(catDoc(userId, id), categoryWritePayload({ ...cat, id }, ts));
            }),
          );
        } else if (marker?.categoriesDeduped !== true) {
          await expenseRepository.deduplicateCategories();
          sweptNow = true;
          await setDoc(markerRef, { categoriesDeduped: true, ranAt: now() }, { merge: true });
        }
        if (!sweptNow && needsOrphanScan(marker)) {
          try {
            await sweepOrphanedExpenses(userId);
          } catch {
            // best-effort
          }
        }
        // Remove the legacy Uncategorized sentinel (id "0") so it stays gone — but only
        // once nothing points at it. deleteCategory reassigns linked transactions to this
        // sink, and firestore.rules requires the target category to exist on every expense
        // update, so clearing it while still referenced orphaned those rows. On web the
        // edit form then silently re-pointed them at whatever category happened to be
        // first, quietly changing the user's categorisation.
        try {
          const sentinel = await getDoc(catDoc(userId, UNCATEGORIZED_ID));
          if (sentinel.exists() && (await expenseDocsForCategory(userId, UNCATEGORIZED_ID)).length === 0) {
            await deleteCategoryInto(userId, UNCATEGORIZED_ID);
          }
        } catch {
          // ignore — doc may already be absent
        }
      } catch (err) {
        console.warn('[ensureSeeded]', err);
      }
    });
  },

  async isAccountDeletionPending(): Promise<boolean> {
    const userId = uid();
    if (!userId || !fs()) return false;
    const snap = await getDoc(metaDoc(userId, ACCOUNT_DELETION_DOC));
    return snap.data()?.pendingDeletion === true;
  },

  async markAccountDeletionPending(): Promise<void> {
    const userId = uid();
    if (!userId) throw new Error('Not signed in');
    await setDoc(metaDoc(userId, ACCOUNT_DELETION_DOC), {
      pendingDeletion: true,
      state: 'deleting',
      startedAt: now(),
    });
  },

  /**
   * `cb`'s second argument is `true` when the listener failed. Callers must not
   * treat `[]` + error as “user has no categories” (that would relabel every
   * expense as unknown). Prefer keeping the last good list on error.
   */
  onCategoriesChanged(cb: (cats: Category[], error?: boolean) => void): Unsubscribe {
    const userId = uid();
    if (!userId) {
      cb([]);
      return () => {};
    }
    return onSnapshot(
      query(catCol(userId), orderBy('sortOrder')),
      (snap) => {
        cb(snap.docs.map(d => ({ ...d.data(), id: d.id } as Category)));
      },
      (err) => {
        console.error('[onCategoriesChanged]', err);
        cb([], true);
      },
    );
  },

  // SECURE: client UUID so creates are idempotent under retries
  async insertCategory(cat: Omit<Category, 'id'>): Promise<string> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    const sanitizedName = CategoryValidator.sanitize(cat.name);
    if (!CategoryValidator.isValid(sanitizedName)) {
      throw new Error('INVALID_CATEGORY_NAME');
    }
    const id = crypto.randomUUID();
    await setDoc(
      catDoc(userId, id),
      categoryWritePayload({ ...cat, id, name: sanitizedName }, now()),
    );
    return id;
  },

  async updateCategory(cat: Category): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId || !cat.id) return;
    const sanitizedName = CategoryValidator.sanitize(cat.name);
    if (!CategoryValidator.isValid(sanitizedName)) {
      throw new Error('INVALID_CATEGORY_NAME');
    }
    await setDoc(
      catDoc(userId, cat.id),
      categoryWritePayload({ ...cat, name: sanitizedName }, now()),
      { merge: true },
    );
  },

  /**
   * Renumber a set of categories in one atomic batch.
   *
   * The batch is deliberate: a reorder touches every category in a type, and a
   * per-document fallback like reassignExpenses' would leave the type half-renumbered —
   * worse than either the old or the new order. The price is that one row the rules
   * refuse takes the whole batch down, which used to surface as a generic "update failed"
   * that repeated forever with no way to tell which category was at fault. Screen for
   * that up front and name the row instead.
   */
  async updateCategoriesBatch(categories: Category[]): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId) return;
    const firestore = fs(); if (!firestore) return;
    const ts = now();
    const payloads = categories
      .filter((cat) => cat.id)
      .map((cat) => {
        const name = CategoryValidator.sanitize(cat.name);
        return categoryWritePayload({ ...cat, name: name || cat.name }, ts);
      });

    const rejected = payloads.filter((p) => !isRulesWritableCategory(p as WritableCategoryShape));
    if (rejected.length > 0) {
      const names = rejected.map((c) => String(c.name ?? c.id ?? '')).join(', ');
      throw new UnwritableCategoryError(names);
    }

    const batch = writeBatch(firestore);
    for (const payload of payloads) {
      batch.set(catDoc(userId, String(payload.id)), payload, { merge: true });
    }
    await batch.commit();
  },

  // Raise a Firestore-visible barrier before reading references. Rules reject new
  // expense references until reassignment and deletion finish.
  async deleteCategory(id: string): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId) return;
    await deleteCategoryInto(
      userId,
      id,
      id === UNCATEGORIZED_ID ? undefined : UNCATEGORIZED_ID,
    );
  },

  async getExpenseById(id: string): Promise<Expense | undefined> {
    const userId = uid(); if (!userId) return undefined;
    const snap = await getDoc(expDoc(userId, id));
    if (!snap.exists()) return undefined;
    return { ...snap.data(), id: snap.id } as Expense;
  },

  async getExpensesInRange(start: number, end: number): Promise<Expense[]> {
    const userId = uid(); if (!userId) return [];
    const q = query(expCol(userId), where('dateMillis', '>=', start), where('dateMillis', '<', end), orderBy('dateMillis', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id } as Expense))
      .filter(e => e.deleted !== true);
  },

  /**
   * `cb`'s second argument is `true` only when the listener itself failed
   * (auth/permission/index/quota error) — callers must use it to distinguish
   * a genuine empty-range result from a broken listener (see loadError in
   * useInsightsViewModel / useRecordViewModel).
   */
  onExpensesInRange(start: number, end: number, cb: (exps: Expense[], error?: boolean) => void): Unsubscribe {
    const userId = uid();
    if (!userId) {
      cb([]);
      return () => {};
    }
    const q = query(
      expCol(userId),
      where('dateMillis', '>=', start),
      where('dateMillis', '<', end),
      orderBy('dateMillis', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        cb(
          snap.docs
            .map(d => ({ ...d.data(), id: d.id } as Expense))
            .filter(e => e.deleted !== true)
        );
      },
      (err) => {
        console.error('[onExpensesInRange]', err);
        cb([], true);
      },
    );
  },

  async countExpensesForCategory(id: string): Promise<number> {
    const u = uid(); if (!u) return 0;
    // Live rows only, mirroring Android: soft-deleted rows are invisible
    // everywhere else, so the delete warning must not count them.
    return (await expenseDocsForCategory(u, id))
      .filter((d) => d.data().deleted !== true).length;
  },

  // A keyed create derives remote identity from the key. The transaction makes the
  // existing-document check and create one atomic operation across tabs/devices/clients.
  async insertExpense(expense: Omit<Expense, 'id'>, idempotencyKey?: string): Promise<string> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    requireVerifiedEmail();
    if (idempotencyKey) {
      // Historical releases used random document ids. Find those first so upgrading a
      // user cannot create a deterministic second copy of an already-recorded expense.
      const dupSnap = await getDocs(query(
        expCol(userId), where('idempotencyKey', '==', idempotencyKey), limit(1),
      ));
      if (!dupSnap.empty) return dupSnap.docs[0].id;

      const id = await expenseDocumentId(idempotencyKey);
      const ref = expDoc(userId, id);
      const payload = expenseWritePayload(
        { ...expense, id },
        // Historical rules bound the raw compatibility field. Identity itself has no
        // such limit because only the fixed-size hash is used as the document path.
        { updatedAt: now(), idempotencyKey: idempotencyKey.length < 128 ? idempotencyKey : undefined },
      );
      const created = await runTransaction(fs()!, async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists()) return false;
        transaction.set(ref, payload);
        return true;
      });
      if (created) emitDataChanged();
      return id;
    }
    const id = crypto.randomUUID();
    await setDoc(
      expDoc(userId, id),
      expenseWritePayload(
        { ...expense, id },
        { updatedAt: now(), idempotencyKey },
      ),
    );
    emitDataChanged();
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    const userId = uid(); if (!userId || !expense.id) return;
    requireVerifiedEmail();
    const existing = await getDoc(expDoc(userId, expense.id));
    if (!existing.exists()) {
      throw new Error('EXPENSE_NOT_FOUND');
    }
    await setDoc(
      expDoc(userId, expense.id),
      expenseWritePayload(expense, { updatedAt: now() }),
      { merge: true },
    );
    emitDataChanged();
  },

  async deleteExpense(id: string): Promise<Expense | null> {
    const userId = uid(); if (!userId) return null;
    requireVerifiedEmail();
    const exp = await this.getExpenseById(id);
    if (!exp) return null;
    await deleteDoc(expDoc(userId, id));
    emitDataChanged();
    return exp;
  },

  /**
   * Month-to-date spend for the budget warning.
   *
   * Runs on every save, and used to pull every expense document in the month to
   * add up one number — 200 transactions in a month meant 200 reads per save.
   * A server-side sum() is billed at one read per 1,000 documents matched, so
   * this is ~1 read regardless of history size.
   *
   * The excluded id (the row being edited, already counted by the server) costs
   * one extra direct read to subtract. Still two reads instead of N.
   */
  async sumMonthExpenses(start: number, end: number, excludeExpenseId?: string): Promise<number> {
    const userId = uid();
    if (!userId) return 0;
    const scoped = query(
      expCol(userId),
      where('transactionType', '==', 'expense'),
      where('dateMillis', '>=', start),
      where('dateMillis', '<', end),
    );
    // sum() has no way to skip the legacy soft-deleted rows in a single pass:
    // `deleted` is absent on every row written since, so no equality filter
    // matches both shapes, and an inequality would collide with the range on
    // dateMillis. Summing the deleted subset on its own and subtracting it is
    // one extra aggregate read (still ~1 per 1,000 documents) and — unlike
    // purging the rows — leaves the user's data untouched.
    // Both passes need `amount` in their composite index, because an aggregation
    // indexes the field it aggregates, not just the ones it filters on:
    // (transactionType, dateMillis, amount) and (transactionType, deleted,
    // dateMillis, amount). Getting this wrong fails with FAILED_PRECONDITION at
    // runtime and nowhere else — the emulator invents indexes on demand, and the
    // caller swallows the error, so only a real device with a budget set shows it.
    const [allAgg, deletedAgg] = await Promise.all([
      getAggregateFromServer(scoped, { total: sum('amount') }),
      getAggregateFromServer(query(scoped, where('deleted', '==', true)), { total: sum('amount') }),
    ]);
    let total = Number(allAgg.data().total ?? 0) - Number(deletedAgg.data().total ?? 0);

    if (excludeExpenseId) {
      const excluded = await getDoc(expDoc(userId, excludeExpenseId));
      const data = excluded.data();
      // Only subtract when it actually falls inside the summed set. A
      // soft-deleted row never does — it came straight back out above.
      if (
        data &&
        data.transactionType === 'expense' &&
        data.deleted !== true &&
        typeof data.dateMillis === 'number' &&
        data.dateMillis >= start &&
        data.dateMillis < end
      ) {
        total -= Number(data.amount ?? 0);
      }
    }

    return roundAmount(Math.max(0, total));
  },

  async deduplicateCategories(): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId) return;

    // SECURE: Raw fetch to catch documents missing 'sortOrder'
    const snap = await getDocs(catCol(userId));
    // Keep the Uncategorized sentinel out of dedupe groups (matches Android)
    const categories = snap.docs
      .map(d => ({ ...d.data(), id: d.id } as Category))
      .filter(c => c.id !== UNCATEGORIZED_ID);

    const groups: Record<string, Category[]> = {};
    categories.forEach(cat => {
      const tag = localeTag(getLocale());
      const key = `${cat.name.toLocaleLowerCase(tag).trim()}_${cat.transactionType}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(cat);
    });

    // Each duplicate group is independent of the others (disjoint category docs / expense
    // sets), so groups run concurrently. Within a group, ops stay sequential per duplicate:
    // the batch commit must wait on that duplicate's own getDocs read before it can fire.
    const resolveGroup = async (master: Category, duplicates: Category[]) => {
      for (const dup of duplicates) {
        await deleteCategoryInto(userId, dup.id, master.id);
      }
    };

    await Promise.all(
      Object.values(groups)
        .filter(group => group.length > 1)
        .map(group => {
          const master = pickDedupeMaster(group);
          const duplicates = group.filter((c) => c.id !== master.id);
          return resolveGroup(master, duplicates);
        }),
    );

    // Repair missing sortOrder fields. Awaited with a per-write catch: these
    // used to be fire-and-forget, so a rejected write surfaced as an unhandled
    // rejection (a mystery crash report) while the orphan sweep below raced it.
    const finalSnap = await getDocs(catCol(userId));
    const repairs: Array<Promise<void>> = [];
    finalSnap.docs.forEach((d, i) => {
        if (d.data().sortOrder === undefined) {
            repairs.push(
                setDoc(d.ref, { sortOrder: i }, { merge: true })
                    .catch((err) => console.error('[expenseRepository] sortOrder repair failed', d.id, err)),
            );
        }
    });
    await Promise.all(repairs);

    // Dedupe's own TOCTOU window can orphan an expense, and this is the user's
    // "repair my categories" action — so sweep here rather than on every launch.
    await sweepOrphanedExpenses(userId);
  },

  /**
   * Wipe every known account document while retaining meta/accountDeletion. All
   * emptiness checks are server-only: an offline/incomplete cache must never allow
   * the irreversible Firebase Auth deletion that follows.
   */
  // DEL-1: iterates the shared firestorePaths registry rather than an independent,
  // hand-maintained list — a new deletable collection/doc added there is picked up
  // here automatically, and firestorePaths.test.ts fails if a new path is ever added
  // to the registry without being classified as deletable or intentionally retained.
  async deleteAllUserData(): Promise<void> {
    const userId = uid();
    if (!userId) throw new Error('Not signed in');
    for (const name of DELETABLE_USER_COLLECTIONS) {
      await deleteCollectionBatched(collectionRef(userId, name));
    }
    const docRefs = DELETABLE_USER_DOCS.map((d) => doc(fs()!, 'users', userId, d.collection, d.id));
    for (const ref of docRefs) {
      await deleteDoc(ref);
    }

    for (const name of DELETABLE_USER_COLLECTIONS) {
      if (!(await getDocsFromServer(query(collectionRef(userId, name), limit(1)))).empty) {
        throw new Error(`${name}_deletion_verification_failed`);
      }
    }
    for (const ref of docRefs) {
      if ((await getDocFromServer(ref)).exists()) {
        throw new Error(`${ref.path}_deletion_verification_failed`);
      }
    }
    emitDataChanged();
  },

};

async function deleteCollectionBatched(colRef: ReturnType<typeof collection>): Promise<void> {
  for (;;) {
    const snap = await getDocsFromServer(query(colRef, limit(400)));
    if (snap.empty) return;
    const batch = writeBatch(fs()!);
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

/**
 * Repair a bounded number of document-ID-ordered pages and persist the cursor after
 * each successful page. A transient/quota failure leaves the last durable cursor and
 * no terminal version, so the next launch retries rather than claiming completion.
 * deleteCategory and deduplicateCategories already reassign their own expenses
 * before dropping a category, which leaves this sweep to catch only rows stranded
 * by an interrupted delete — a one-time pass, plus the manual "Deduplicate"
 * action, covers that.
 *
 * Rules-rejected legacy rows are counted and reported as `complete_with_errors`; they
 * do not block later pages. `orphanScanVersion` is written only after the terminal page.
 */
const ORPHAN_PAGE_SIZE = 450;
const ORPHAN_PAGES_PER_RUN = 10;

async function sweepOrphanedExpenses(userId: string): Promise<void> {
  const markerRef = metaDoc(userId, DEDUPE_DOC);
  const initial = (await getDoc(markerRef)).data();
  let cursor = initial?.orphanRepairTargetVersion === ORPHAN_SCAN_VERSION &&
    typeof initial.orphanRepairCursorId === 'string'
    ? initial.orphanRepairCursorId : null;

  for (let page = 0; page < ORPHAN_PAGES_PER_RUN; page++) {
    const expectedCursor = cursor;
    const result = await repairOrphanPage(userId, cursor);
    const advanced = await runTransaction(fs()!, async (transaction) => {
      const latest = (await transaction.get(markerRef)).data();
      const sameGeneration = latest?.orphanRepairTargetVersion === ORPHAN_SCAN_VERSION;
      const latestCursor = sameGeneration && typeof latest?.orphanRepairCursorId === 'string'
        ? latest.orphanRepairCursorId : null;
      // Another device advanced this generation while this page was in flight.
      if (latestCursor !== expectedCursor) return false;
      const priorUnfixable = sameGeneration && typeof latest?.orphanRepairUnfixable === 'number'
        ? latest.orphanRepairUnfixable : 0;
      transaction.set(markerRef, result.complete ? {
        orphansScannedAt: now(),
        orphanScanVersion: ORPHAN_SCAN_VERSION,
        orphanRepairState: priorUnfixable + result.unfixable > 0 ? 'complete_with_errors' : 'complete',
        orphanRepairUnfixable: priorUnfixable + result.unfixable,
        orphanRepairUpdatedAt: now(),
        orphanRepairCursorId: deleteField(),
        orphanRepairTargetVersion: deleteField(),
        orphanRepairScanTruncated: deleteField(),
      } : {
        orphanRepairState: 'running',
        orphanRepairCursorId: result.nextCursor,
        orphanRepairTargetVersion: ORPHAN_SCAN_VERSION,
        orphanRepairUnfixable: priorUnfixable + result.unfixable,
        orphanRepairUpdatedAt: now(),
        orphanRepairScanTruncated: deleteField(),
      }, { merge: true });
      return true;
    });
    if (!advanced || result.complete) return;
    cursor = result.nextCursor;
  }
}

interface OrphanRepairPageResult {
  unfixable: number;
  complete: boolean;
  nextCursor: string | null;
}

/** Repair one restartable page; the caller advances its cursor only after this succeeds. */
async function repairOrphanPage(userId: string, cursor: string | null): Promise<OrphanRepairPageResult> {
  const catSnap = await getDocs(catCol(userId));
  const catIds = new Set(catSnap.docs.map((d) => d.id));
  if (catIds.size === 0) return { unfixable: 0, complete: true, nextCursor: null };
  const base = query(expCol(userId), orderBy(documentId()), limit(ORPHAN_PAGE_SIZE));
  const expSnap = await getDocs(cursor ? query(base, startAfter(cursor)) : base);
  const orphans = expSnap.docs.filter((d) => {
    const data = d.data();
    // Soft-deleted rows are filtered out of every read path and excluded from the
    // month total, so repointing them would only spend writes on rows nothing
    // reads. They are left exactly as they are — legacy data is tolerated here,
    // never rewritten and never destroyed (see docs/maintenance.md).
    if (data.deleted === true) return false;
    const cid = String(data.categoryId ?? '');
    return cid.length > 0 && !catIds.has(cid);
  });
  let unfixable = 0;
  if (orphans.length > 0) {
    await ensureUncategorizedCategory(userId);
    unfixable = await reassignExpenses(orphans, UNCATEGORIZED_ID);
  }
  return {
    unfixable,
    complete: expSnap.size < ORPHAN_PAGE_SIZE,
    nextCursor: expSnap.docs.at(-1)?.id ?? null,
  };
}
