import {
  collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, where, orderBy,
  onSnapshot, type Unsubscribe, writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import type { Category, Expense, TransactionTypeFilter } from '@/models/types';

function uid(): string | null { return useAuthStore.getState().user?.uid ?? null; }
function now() { return Date.now(); }
function fs() { return getFirebaseFirestore(); }
function catCol(u: string) { return collection(fs()!, 'users', u, 'categories'); }
function expCol(u: string) { return collection(fs()!, 'users', u, 'expenses'); }
function catDoc(u: string, id: string) { return doc(fs()!, 'users', u, 'categories', id); }
function expDoc(u: string, id: string) { return doc(fs()!, 'users', u, 'expenses', id); }

const UNCATEGORIZED_ID = '0';
const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

/** Match Android Int colorInts (signed 32-bit) for shared Firestore docs. */
function argb(hex: number): number {
  return hex | 0;
}

/** Same defaults as AppRepository.ensureSeeded() on Android. */
const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Groceries', iconName: 'shopping_cart', colorInt: argb(0xffe86b5a), transactionType: 'expense', sortOrder: 0 },
  { name: 'Shopping', iconName: 'shopping_bag', colorInt: argb(0xffe8a060), transactionType: 'expense', sortOrder: 1 },
  { name: 'Dining', iconName: 'restaurant', colorInt: argb(0xffd4849a), transactionType: 'expense', sortOrder: 2 },
  { name: 'Transport', iconName: 'car', colorInt: argb(0xff6a9fd4), transactionType: 'expense', sortOrder: 3 },
  { name: 'Bills', iconName: 'bolt', colorInt: argb(0xff9a8fd4), transactionType: 'expense', sortOrder: 4 },
  { name: 'Subscriptions', iconName: 'subscriptions', colorInt: argb(0xff5ab8aa), transactionType: 'expense', sortOrder: 5 },
  { name: 'Salary', iconName: 'credit_card', colorInt: argb(0xff5cb88a), transactionType: 'income', sortOrder: 0 },
  { name: 'Freelance', iconName: 'work', colorInt: argb(0xff6a9fd4), transactionType: 'income', sortOrder: 1 },
  { name: 'Refunds', iconName: 'undo', colorInt: argb(0xffb8a060), transactionType: 'income', sortOrder: 2 },
  { name: 'Transfer', iconName: 'swap_horiz', colorInt: argb(0xff8e8e96), transactionType: 'transfer', sortOrder: 0 },
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

export const expenseRepository = {

  /**
   * @deprecated Prefer onExpensesInRange — full-collection listeners burn Spark read quota.
   * Kept for rare one-shot / export paths via getAllExpenses.
   */
  onExpensesChanged(cb: (exps: Expense[]) => void): Unsubscribe {
    console.warn('[expenseRepository] onExpensesChanged is unbounded; prefer onExpensesInRange');
    const u = uid();
    if (!u) {
      cb([]);
      return () => {};
    }
    return onSnapshot(
      query(expCol(u), orderBy('dateMillis', 'desc')),
      (snap) => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      },
      (err) => {
        console.error('[onExpensesChanged]', err);
        cb([]);
      },
    );
  },

  async getAllExpenses(): Promise<Expense[]> {
    const u = uid();
    if (!u) return [];
    const s = await getDocs(query(expCol(u), orderBy('dateMillis', 'desc')));
    return s.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
  },

  async getCategoriesByType(type: string): Promise<Category[]> { const u = uid(); if (!u) return []; const s = await getDocs(query(catCol(u), where('transactionType', '==', type), orderBy('sortOrder'))); return s.docs.map(d => ({ id: d.id, ...d.data() } as Category)); },

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
    if (ensureSeededInFlight && ensureSeededForUid === userId) {
      await ensureSeededInFlight;
      return;
    }
    ensureSeededForUid = userId;
    ensureSeededInFlight = (async () => {
      try {
        const snap = await getDocs(catCol(userId));
        if (snap.empty) {
          const ts = now();
          await Promise.all(
            DEFAULT_CATEGORIES.map(async (cat) => {
              const id = crypto.randomUUID();
              await setDoc(catDoc(userId, id), { ...cat, id, updatedAt: ts });
            }),
          );
        } else {
          await expenseRepository.deduplicateCategories();
        }
      } catch (err) {
        console.warn('[ensureSeeded]', err);
      } finally {
        ensureSeededInFlight = null;
      }
    })();
    await ensureSeededInFlight;
  },

  onCategoriesChanged(cb: (cats: Category[]) => void): Unsubscribe {
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
        cb([]);
      },
    );
  },

  // SECURE: client UUID so creates are idempotent under retries
  async insertCategory(cat: Omit<Category, 'id'>): Promise<string> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    const id = crypto.randomUUID();
    await setDoc(catDoc(userId, id), { ...cat, id, updatedAt: now() });
    return id;
  },

  async updateCategory(cat: Category): Promise<void> {
    const userId = uid(); if (!userId || !cat.id) return;
    await setDoc(catDoc(userId, cat.id), { ...cat, updatedAt: now() }, { merge: true });
  },

  // SECURE: Safety-first deletion (move orphaned to uncategorized)
  async deleteCategory(id: string): Promise<void> {
    const userId = uid(); if (!userId) return;
    const linked = await getDocs(query(expCol(userId), where('categoryId', '==', id)));
    if (!linked.empty) {
        const batch = writeBatch(fs()!);
        linked.docs.forEach(d => {
            batch.update(d.ref, { categoryId: UNCATEGORIZED_ID });
        });
        await batch.commit();
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

  async queryExpenses(params: ExpenseQueryParams): Promise<Expense[]> {
    const userId = uid(); if (!userId) return [];
    const q = query(expCol(userId), where('dateMillis', '>=', params.startMillis), where('dateMillis', '<', params.endMillis), orderBy('dateMillis', 'desc'));
    const snap = await getDocs(q);
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    if (params.typeFilter !== 'all') items = items.filter(e => e.transactionType === params.typeFilter);
    const sq = params.searchQuery.trim().toLocaleLowerCase('en');
    if (sq) {
      const cats = await this.getAllCategories();
      const catMap = new Map(cats.map(c => [c.id, c]));
      items = items.filter(e => {
        const cat = catMap.get(e.categoryId);
        return e.note.toLocaleLowerCase('en').includes(sq) || String(e.amount).includes(sq) || (cat?.name.toLocaleLowerCase('en').includes(sq) ?? false);
      });
    }
    return items;
  },

  onExpensesInRange(start: number, end: number, cb: (exps: Expense[]) => void): Unsubscribe {
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
        cb([]);
      },
    );
  },

  async countExpensesForCategory(id: string): Promise<number> {
    const u = uid(); if (!u) return 0;
    const snap = await getDocs(query(expCol(u), where('categoryId', '==', id)));
    return snap.size;
  },

  // SECURE: UUID and Math.round for integrity
  async insertExpense(expense: Omit<Expense, 'id'>, idempotencyKey?: string): Promise<string> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    if (idempotencyKey) {
      const dupSnap = await getDocs(query(expCol(userId), where('idempotencyKey', '==', idempotencyKey)));
      if (!dupSnap.empty) return dupSnap.docs[0].id;
    }
    const id = crypto.randomUUID();
    const payload = {
        ...expense,
        id,
        amount: roundAmount(expense.amount),
        updatedAt: now()
    } as any;
    if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
    await setDoc(expDoc(userId, id), payload);
    emitDataChanged();
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    const userId = uid(); if (!userId || !expense.id) return;
    await setDoc(expDoc(userId, expense.id), { ...expense, amount: roundAmount(expense.amount), updatedAt: now() }, { merge: true });
    emitDataChanged();
  },

  async deleteExpense(id: string): Promise<Expense | null> {
    const userId = uid(); if (!userId) return null;
    const exp = await this.getExpenseById(id);
    if (!exp) return null;
    await deleteDoc(expDoc(userId, id));
    emitDataChanged();
    return exp;
  },

  async restoreExpense(expense: Expense): Promise<string> {
    const { id: _id, ...rest } = expense;
    return this.insertExpense(rest);
  },

  async sumMonthExpenses(start: number, end: number): Promise<number> {
    const items = await this.getExpensesInRange(start, end);
    const raw = items.filter(e => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0);
    return roundAmount(raw);
  },

  async deduplicateCategories(): Promise<void> {
    const userId = uid(); if (!userId) return;

    // SECURE: Raw fetch to catch documents missing 'sortOrder'
    const snap = await getDocs(catCol(userId));
    // Keep the Uncategorized sentinel out of dedupe groups (matches Android)
    const categories = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Category))
      .filter(c => c.id !== UNCATEGORIZED_ID);

    const groups: Record<string, Category[]> = {};
    categories.forEach(cat => {
      const key = `${cat.name.toLocaleLowerCase('en').trim()}_${cat.transactionType}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(cat);
    });

    for (const key in groups) {
      const group = groups[key];
      if (group.length > 1) {
        const master = group[0];
        const duplicates = group.slice(1);

        for (const dup of duplicates) {
          const linked = await getDocs(query(expCol(userId), where('categoryId', '==', dup.id)));
          if (!linked.empty) {
            // Handle chunking for Firestore batch limit (500)
            const docs = linked.docs;
            for (let i = 0; i < docs.length; i += 450) {
              const chunk = docs.slice(i, i + 450);
              const batch = writeBatch(fs()!);
              chunk.forEach(d => {
                batch.update(d.ref, { categoryId: master.id });
              });
              await batch.commit();
            }
          }
          await deleteDoc(catDoc(userId, dup.id));
        }
      }
    }

    // Repair missing sortOrder fields
    const finalSnap = await getDocs(catCol(userId));
    finalSnap.docs.forEach((d, i) => {
        if (d.data().sortOrder === undefined) {
            void setDoc(d.ref, { sortOrder: i }, { merge: true });
        }
    });
  },
};

export interface ExpenseQueryParams {
  startMillis: number; endMillis: number; typeFilter: TransactionTypeFilter; searchQuery: string;
}
