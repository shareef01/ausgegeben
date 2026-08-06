import {
  collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, updateDoc, getAggregateFromServer, sum, type Unsubscribe, writeBatch,
  type CollectionReference, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { t, getLocale, localeTag } from '@/i18n';
import type { Category, Expense } from '@/models/types';

function uid(): string | null { return useAuthStore.getState().user?.uid ?? null; }
function now() { return Date.now(); }
function fs() { return getFirebaseFirestore(); }
function catCol(u: string) { return collection(fs()!, 'users', u, 'categories'); }
function expCol(u: string) { return collection(fs()!, 'users', u, 'expenses'); }
function catDoc(u: string, id: string) { return doc(fs()!, 'users', u, 'categories', id); }
function expDoc(u: string, id: string) { return doc(fs()!, 'users', u, 'expenses', id); }
function metaDoc(u: string, id: string) { return doc(fs()!, 'users', u, 'meta', id); }

/** Thrown when Firestore rules would reject expense writes for unverified accounts. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedError';
  }
}

function requireVerifiedEmail(): void {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not signed in');
  if (!user.emailVerified) throw new EmailNotVerifiedError();
}

export const UNCATEGORIZED_ID = '0';
const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

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

let ensureSeededInFlight: Promise<void> | null = null;
let ensureSeededForUid: string | null = null;

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
  if (snap.exists()) return;
  await setDoc(ref, {
    id: UNCATEGORIZED_ID,
    name: t('recordUnknownCategory'),
    iconName: 'help_outline',
    colorInt: argb(0xff8e8e96),
    transactionType: 'expense',
    sortOrder: 999,
    updatedAt: now(),
  });
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
    } catch (err) {
      console.warn('[reassignExpenses] batch rejected — retrying one at a time', err);
      for (const d of chunk) {
        try {
          await updateDoc(d.ref, { categoryId: targetCategoryId });
        } catch (docErr) {
          unfixable += 1;
          console.warn(`[reassignExpenses] could not reassign ${d.id}`, docErr);
        }
      }
    }
  }
  return unfixable;
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
          .map((d) => ({ id: d.id, ...d.data() } as Expense))
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
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
    if (ensureSeededInFlight && ensureSeededForUid === userId) {
      await ensureSeededInFlight;
      return;
    }
    ensureSeededForUid = userId;
    ensureSeededInFlight = (async () => {
      try {
        // Nothing clears this marker, by design: re-seeding would dress a half-deleted
        // account up as a working fresh one. The consequence is that the account stays
        // unusable — no categories, so nothing can be recorded — until the user retries
        // deletion and it succeeds. That is the only exit, and it is what the failure
        // toast tells them to do ('settingsDeleteAccountIncomplete').
        if (await expenseRepository.isAccountDeletionPending()) {
          console.warn('[ensureSeeded] skipped: account deletion incomplete');
          return;
        }
        const markerRef = metaDoc(userId, 'dedupe');
        const marker = (await getDoc(markerRef)).data();
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
              await setDoc(catDoc(userId, id), { ...cat, id, updatedAt: ts });
            }),
          );
        } else if (marker?.categoriesDeduped !== true) {
          await expenseRepository.deduplicateCategories();
          sweptNow = true;
          await setDoc(markerRef, { categoriesDeduped: true, ranAt: now() }, { merge: true });
        }
        if (!sweptNow && typeof marker?.orphansScannedAt !== 'number') {
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
            await deleteDoc(catDoc(userId, UNCATEGORIZED_ID));
          }
        } catch {
          // ignore — doc may already be absent
        }
      } catch (err) {
        console.warn('[ensureSeeded]', err);
      } finally {
        ensureSeededInFlight = null;
      }
    })();
    await ensureSeededInFlight;
  },

  async isAccountDeletionPending(): Promise<boolean> {
    const userId = uid();
    if (!userId || !fs()) return false;
    try {
      const snap = await getDoc(metaDoc(userId, 'accountDeletion'));
      return snap.data()?.pendingDeletion === true;
    } catch {
      return false;
    }
  },

  async markAccountDeletionPending(): Promise<void> {
    const userId = uid();
    if (!userId) throw new Error('Not signed in');
    await setDoc(metaDoc(userId, 'accountDeletion'), {
      pendingDeletion: true,
      wipedAt: now(),
    });
  },

  /**
   * Abandon a half-finished deletion and let the account be used again.
   *
   * When the cloud wipe succeeds but the Auth delete does not, the marker stays set
   * and ensureSeeded refuses to re-seed — deliberately, so a half-deleted account
   * cannot masquerade as a working fresh one. The cost was that retrying deletion
   * became the only exit; if it kept failing, the account was stranded with no
   * categories and no way to record anything.
   *
   * Clearing the marker is the second exit. firestore.rules already allows it:
   * canDeleteOwned passes here precisely *because* pendingDeletion is true, so this
   * works even for an unverified account. The data is still gone — this only agrees
   * to stop treating the account as mid-deletion.
   */
  async clearAccountDeletionPending(): Promise<void> {
    const userId = uid();
    if (!userId) throw new Error('Not signed in');
    await deleteDoc(metaDoc(userId, 'accountDeletion'));
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
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
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
    const id = crypto.randomUUID();
    const payload = {
      ...cat,
      id,
      name: cat.name.trim().slice(0, 80),
      updatedAt: now()
    };
    await setDoc(catDoc(userId, id), payload);
    return id;
  },

  async updateCategory(cat: Category): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId || !cat.id) return;
    const payload = {
      ...cat,
      name: cat.name.trim().slice(0, 80),
      updatedAt: now()
    };
    await setDoc(catDoc(userId, cat.id), payload, { merge: true });
  },

  // SECURE: Safety-first deletion (move orphaned to uncategorized — except when
  // deleting the uncategorized sentinel itself, which is allowed and leaves
  // linked expenses with categoryId '0'; the UI already falls back to "unknown").
  async deleteCategory(id: string): Promise<void> {
    requireVerifiedEmail();
    const userId = uid(); if (!userId) return;
    if (id === UNCATEGORIZED_ID) {
      await deleteDoc(catDoc(userId, id));
      return;
    }
    // Create the sink only when there is something to put in it. This used to run
    // unconditionally, so deleting an unused category still wrote a sentinel doc that
    // nothing referenced — a needless write on a Spark quota, and a stray category
    // that lingered until the next ensureSeeded pass swept it back up.
    const linked = await expenseDocsForCategory(userId, id);
    if (linked.length > 0) {
        await ensureUncategorizedCategory(userId);
        await reassignExpenses(linked, UNCATEGORIZED_ID);
    }
    // SECURE (mitigation, not a full guarantee): ideally this whole read-reassign-delete
    // sequence would run inside a single runTransaction(db, ...) so no expense could be
    // (re)linked to `id` between the read above and the deleteDoc below. But Firestore's
    // Web SDK only allows direct doc reads (tx.get(docRef)) inside a transaction callback —
    // query-based reads like getDocs(query(...)) aren't transactional, and "all expenses
    // with categoryId == id" is a query over an a-priori unknown set of docs, so it can't
    // be wrapped that way. As the best available mitigation, we re-run the same query one
    // more time immediately before deleting the category, and reassign anything that shows
    // up newly linked. This shrinks the race window from "arbitrarily long" down to "the
    // network latency of one extra query round-trip" — a concurrent write landing in that
    // final gap can still orphan an expense; it just makes the window much narrower.
    const recheck = await expenseDocsForCategory(userId, id);
    if (recheck.length > 0) {
        // Reached when an expense was linked inside the race window above, so the
        // sink may not exist yet — ensureUncategorizedCategory no-ops if it does.
        await ensureUncategorizedCategory(userId);
        await reassignExpenses(recheck, UNCATEGORIZED_ID);
    }
    await deleteDoc(catDoc(userId, id));
  },

  async getExpenseById(id: string): Promise<Expense | undefined> {
    const userId = uid(); if (!userId) return undefined;
    const snap = await getDoc(expDoc(userId, id));
    if (!snap.exists()) return undefined;
    return { id: snap.id, ...snap.data() } as Expense;
  },

  async getExpensesInRange(start: number, end: number): Promise<Expense[]> {
    const userId = uid(); if (!userId) return [];
    const q = query(expCol(userId), where('dateMillis', '>=', start), where('dateMillis', '<', end), orderBy('dateMillis', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Expense))
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
            .map(d => ({ id: d.id, ...d.data() } as Expense))
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
    return (await expenseDocsForCategory(u, id)).length;
  },

  // SECURE: UUID and Math.round for integrity
  async insertExpense(expense: Omit<Expense, 'id'>, idempotencyKey?: string): Promise<string> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    requireVerifiedEmail();
    if (idempotencyKey) {
      const dupSnap = await getDocs(query(expCol(userId), where('idempotencyKey', '==', idempotencyKey)));
      if (!dupSnap.empty) return dupSnap.docs[0].id;
    }
    const id = crypto.randomUUID();
    const payload = {
        ...expense,
        id,
        amount: roundAmount(expense.amount),
        note: expense.note.trim().slice(0, 2000),
        updatedAt: now()
    } as any;
    if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
    await setDoc(expDoc(userId, id), payload);
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
    const payload = {
      ...expense,
      amount: roundAmount(expense.amount),
      note: expense.note.trim().slice(0, 2000),
      updatedAt: now()
    };
    await setDoc(expDoc(userId, expense.id), payload, { merge: true });
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
      .map(d => ({ id: d.id, ...d.data() } as Category))
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
        const linked = await expenseDocsForCategory(userId, dup.id);
        if (linked.length > 0) {
          await reassignExpenses(linked, master.id);
        }
        // SECURE (mitigation, not a full guarantee): same TOCTOU gap as deleteCategory()
        // above — an expense could be (re)linked to `dup.id` between the getDocs read and
        // the deleteDoc below, leaving it orphaned once the duplicate category is gone. A
        // single Firestore transaction can't wrap this because the Web SDK only supports
        // transactional direct doc reads (tx.get), not query-based reads like
        // getDocs(query(...)), and "expenses with categoryId == dup.id" is a query, not a
        // known set of doc refs. As the best available mitigation, re-run the query once
        // more immediately before deleting, and reassign anything newly linked. This
        // narrows the race window from "arbitrarily long" to "one extra query round-trip"
        // rather than closing it entirely.
        const recheck = await expenseDocsForCategory(userId, dup.id);
        if (recheck.length > 0) {
          await reassignExpenses(recheck, master.id);
        }
        await deleteDoc(catDoc(userId, dup.id));
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

    // Repair missing sortOrder fields
    const finalSnap = await getDocs(catCol(userId));
    finalSnap.docs.forEach((d, i) => {
        if (d.data().sortOrder === undefined) {
            void setDoc(d.ref, { sortOrder: i }, { merge: true });
        }
    });

    // Dedupe's own TOCTOU window can orphan an expense, and this is the user's
    // "repair my categories" action — so sweep here rather than on every launch.
    await sweepOrphanedExpenses(userId);
  },

  /** Wipe cloud docs for account deletion. Keeps meta/accountDeletion marker. */
  async deleteAllUserData(): Promise<void> {
    const userId = uid();
    if (!userId) throw new Error('Not signed in');
    await deleteCollectionBatched(expCol(userId));
    await deleteCollectionBatched(catCol(userId));
    try {
      await deleteDoc(doc(fs()!, 'users', userId, 'settings', 'preferences'));
    } catch { /* missing prefs is fine */ }
    try {
      await deleteDoc(metaDoc(userId, 'dedupe'));
    } catch { /* missing marker is fine */ }
    emitDataChanged();
  },
};

/**
 * Run the orphan scan and record that it happened, so cold starts can skip it.
 * The scan reads the whole expenses collection; on Spark the daily read quota is
 * the only backstop this project has, so it must not run on every launch.
 * deleteCategory and deduplicateCategories already reassign their own expenses
 * before dropping a category, which leaves this sweep to catch only rows stranded
 * by an interrupted delete — a one-time pass, plus the manual "Deduplicate"
 * action, covers that.
 *
 * The marker is written even when some rows could not be repaired. A document the
 * rules will never accept would otherwise keep the sweep un-recorded forever, so
 * every cold start would re-read the whole collection chasing a repair that cannot
 * succeed — the exact cost this marker exists to avoid.
 */
async function sweepOrphanedExpenses(userId: string): Promise<void> {
  const unfixable = await repairOrphanedExpenses(userId);
  if (unfixable > 0) {
    console.warn(`[sweepOrphanedExpenses] ${unfixable} expense(s) could not be repaired`);
  }
  await setDoc(metaDoc(userId, 'dedupe'), { orphansScannedAt: now() }, { merge: true });
}

/** Returns the number of orphans the rules refused to let us repair. */
async function repairOrphanedExpenses(userId: string): Promise<number> {
  const catSnap = await getDocs(catCol(userId));
  const catIds = new Set(catSnap.docs.map((d) => d.id));
  if (catIds.size === 0) return 0;
  const expSnap = await getDocs(query(expCol(userId), limit(5_000)));
  const orphans = expSnap.docs.filter((d) => {
    const data = d.data();
    // Soft-deleted rows are filtered out of every read path and excluded from the
    // month total, so repointing them would only spend writes on rows nothing
    // reads. They are left exactly as they are — legacy data is tolerated here,
    // never rewritten and never destroyed (AGENTS.md section 2).
    if (data.deleted === true) return false;
    const cid = String(data.categoryId ?? '');
    return cid.length > 0 && !catIds.has(cid);
  });
  if (orphans.length === 0) return 0;
  await ensureUncategorizedCategory(userId);
  return reassignExpenses(orphans, UNCATEGORIZED_ID);
}

async function deleteCollectionBatched(colRef: CollectionReference): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(colRef, limit(400)));
    if (snap.empty) break;
    const batch = writeBatch(fs()!);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
