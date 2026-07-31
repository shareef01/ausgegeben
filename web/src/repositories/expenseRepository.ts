import {
  collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, type Unsubscribe, writeBatch, type CollectionReference, type QueryDocumentSnapshot,
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

/** Notify UI listeners after writes (Insights / all-time one-shot refetch). */
function emitDataChanged() {
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
   */
  async getAllExpensesCapped(max = 5_000): Promise<{ items: Expense[]; truncated: boolean }> {
    const u = uid();
    if (!u) return { items: [], truncated: false };
    const snap = await getDocs(query(expCol(u), orderBy('dateMillis', 'desc'), limit(max + 1)));
    const truncated = snap.docs.length > max;
    const docs = truncated ? snap.docs.slice(0, max) : snap.docs;
    if (truncated) {
      console.warn(`[expenseRepository] getAllExpenses capped at ${max} rows`);
    }
    return {
      items: docs.map((d) => ({ id: d.id, ...d.data() } as Expense)),
      truncated,
    };
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
    await ensureUncategorizedCategory(userId);
    const linked = await expenseDocsForCategory(userId, id);
    if (linked.length > 0) {
        const batch = writeBatch(fs()!);
        linked.forEach(d => {
            batch.update(d.ref, { categoryId: UNCATEGORIZED_ID });
        });
        await batch.commit();
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
        const recheckBatch = writeBatch(fs()!);
        recheck.forEach(d => {
            recheckBatch.update(d.ref, { categoryId: UNCATEGORIZED_ID });
        });
        await recheckBatch.commit();
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
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
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
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

  async sumMonthExpenses(start: number, end: number, excludeExpenseId?: string): Promise<number> {
    const items = await this.getExpensesInRange(start, end);
    const raw = items
      .filter((e) => e.transactionType === 'expense' && e.id !== excludeExpenseId)
      .reduce((s, e) => s + e.amount, 0);
    return roundAmount(raw);
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
          // Handle chunking for Firestore batch limit (500)
          for (let i = 0; i < linked.length; i += 450) {
            const chunk = linked.slice(i, i + 450);
            const batch = writeBatch(fs()!);
            chunk.forEach(d => {
              batch.update(d.ref, { categoryId: master.id });
            });
            await batch.commit();
          }
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
          for (let i = 0; i < recheck.length; i += 450) {
            const chunk = recheck.slice(i, i + 450);
            const recheckBatch = writeBatch(fs()!);
            chunk.forEach(d => {
              recheckBatch.update(d.ref, { categoryId: master.id });
            });
            await recheckBatch.commit();
          }
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
 */
async function sweepOrphanedExpenses(userId: string): Promise<void> {
  await repairOrphanedExpenses(userId);
  await setDoc(metaDoc(userId, 'dedupe'), { orphansScannedAt: now() }, { merge: true });
}

async function repairOrphanedExpenses(userId: string): Promise<void> {
  const catSnap = await getDocs(catCol(userId));
  const catIds = new Set(catSnap.docs.map((d) => d.id));
  if (catIds.size === 0) return;
  const expSnap = await getDocs(query(expCol(userId), limit(5_000)));
  const orphans = expSnap.docs.filter((d) => {
    const cid = String(d.data().categoryId ?? '');
    return cid.length > 0 && !catIds.has(cid);
  });
  if (orphans.length === 0) return;
  await ensureUncategorizedCategory(userId);
  for (let i = 0; i < orphans.length; i += 450) {
    const chunk = orphans.slice(i, i + 450);
    const batch = writeBatch(fs()!);
    chunk.forEach((d) => {
      batch.update(d.ref, { categoryId: UNCATEGORIZED_ID });
    });
    await batch.commit();
  }
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
