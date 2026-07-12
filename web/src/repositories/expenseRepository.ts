import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy,
  runTransaction, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import type { Category, Expense, TransactionTypeFilter } from '@/models/types';

function uid(): string | null { return useAuthStore.getState().user?.uid ?? null; }
function now() { return Date.now(); }
function fs() { return getFirebaseFirestore(); }
function catCol(u: string) { return collection(fs()!, 'users', u, 'categories'); }
function expCol(u: string) { return collection(fs()!, 'users', u, 'expenses'); }
function catDoc(u: string, id: number) { return doc(fs()!, 'users', u, 'categories', String(id)); }
function expDoc(u: string, id: number) { return doc(fs()!, 'users', u, 'expenses', String(id)); }

async function nextId(kind: string): Promise<number> {
  const userId = uid(); if (!userId) throw new Error('Not signed in');
  const counterRef = doc(fs()!, 'users', userId, '_counters', kind);
  const newId = await runTransaction(fs()!, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = (snap.data()?.value as number) ?? 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return newId;
}

export const expenseRepository = {

  async getAllExpenses(): Promise<Expense[]> { const u = uid(); if (!u) return []; const s = await getDocs(query(expCol(u), orderBy('dateMillis', 'desc'))); return s.docs.map(d => ({ id: Number(d.id), ...d.data() } as Expense)); },

  async getCategoriesByType(type: string): Promise<Category[]> { const u = uid(); if (!u) return []; const s = await getDocs(query(catCol(u), where('transactionType', '==', type), orderBy('sortOrder'))); return s.docs.map(d => ({ id: Number(d.id), ...d.data() } as Category)); },

  async getAllCategories(): Promise<Category[]> {
    const userId = uid(); if (!userId) return [];
    const snap = await getDocs(query(catCol(userId), orderBy('sortOrder')));
    return snap.docs.map(d => ({ id: Number(d.id), ...d.data() } as Category));
  },

  onCategoriesChanged(cb: (cats: Category[]) => void): Unsubscribe {
    const userId = uid(); if (!userId) { cb([]); return () => {}; }
    return onSnapshot(query(catCol(userId), orderBy('sortOrder')), snap =>
      cb(snap.docs.map(d => ({ id: Number(d.id), ...d.data() } as Category))));
  },

  async insertCategory(cat: Omit<Category, 'id'>): Promise<number> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    const id = await nextId('categories');
    await setDoc(catDoc(userId, id), { ...cat, updatedAt: now() });
    return id;
  },

  async updateCategory(cat: Category): Promise<void> {
    const userId = uid(); if (!userId || !cat.id) return;
    await setDoc(catDoc(userId, cat.id), { ...cat, updatedAt: now() }, { merge: true });
  },

  async deleteCategory(id: number): Promise<void> {
    const userId = uid(); if (!userId) return;
    const linked = await getDocs(query(expCol(userId), where('categoryId', '==', id)));
    for (const d of linked.docs) await deleteDoc(d.ref);
    await deleteDoc(catDoc(userId, id));
  },

  async getExpenseById(id: number): Promise<Expense | undefined> {
    const userId = uid(); if (!userId) return undefined;
    const snap = await getDocs(query(expCol(userId), where('__name__', '==', String(id))));
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return { id: Number(d.id), ...d.data() } as Expense;
  },

  async getExpensesInRange(start: number, end: number): Promise<Expense[]> {
    const userId = uid(); if (!userId) return [];
    const q = query(expCol(userId), where('dateMillis', '>=', start), where('dateMillis', '<', end), orderBy('dateMillis', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: Number(d.id), ...d.data() } as Expense));
  },

  async queryExpenses(params: ExpenseQueryParams): Promise<Expense[]> {
    const userId = uid(); if (!userId) return [];
    const q = query(expCol(userId), where('dateMillis', '>=', params.startMillis), where('dateMillis', '<', params.endMillis), orderBy('dateMillis', 'desc'));
    const snap = await getDocs(q);
    let items = snap.docs.map(d => ({ id: Number(d.id), ...d.data() } as Expense));
    if (params.typeFilter !== 'all') items = items.filter(e => e.transactionType === params.typeFilter);
    const sq = params.searchQuery.trim().toLowerCase();
    if (sq) {
      const cats = await this.getAllCategories();
      const catMap = new Map(cats.map(c => [c.id!, c]));
      items = items.filter(e => {
        const cat = catMap.get(e.categoryId);
        return e.note.toLowerCase().includes(sq) || String(e.amount).includes(sq) || (cat?.name.toLowerCase().includes(sq) ?? false);
      });
    }
    return items;
  },

  onExpensesInRange(start: number, end: number, cb: (exps: Expense[]) => void): Unsubscribe {
    const userId = uid(); if (!userId) { cb([]); return () => {}; }
    const q = query(expCol(userId), where('dateMillis', '>=', start), where('dateMillis', '<', end), orderBy('dateMillis', 'desc'));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: Number(d.id), ...d.data() } as Expense))));
  },

  async insertExpense(expense: Omit<Expense, 'id'>, idempotencyKey?: string): Promise<number> {
    const userId = uid(); if (!userId) throw new Error('Not signed in');
    // Idempotency: if client provides a key, check for duplicate first
    if (idempotencyKey) {
      const dupSnap = await getDocs(query(
        expCol(userId),
        where('idempotencyKey', '==', idempotencyKey),
        orderBy('dateMillis', 'desc'),
      ));
      if (!dupSnap.empty) {
        return Number(dupSnap.docs[0].id);
      }
    }
    const id = await nextId('expenses');
    const payload: Record<string, unknown> = { ...expense, updatedAt: now() };
    if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
    await setDoc(expDoc(userId, id), payload);
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    const userId = uid(); if (!userId || !expense.id) return;
    await setDoc(expDoc(userId, expense.id), { ...expense, updatedAt: now() }, { merge: true });
  },

  async deleteExpense(id: number): Promise<Expense | null> {
    const userId = uid(); if (!userId) return null;
    const exp = await this.getExpenseById(id);
    if (!exp) return null;
    await deleteDoc(expDoc(userId, id));
    return exp;
  },

  async restoreExpense(expense: Expense): Promise<number> {
    const { id: _id, ...rest } = expense;
    return this.insertExpense(rest);
  },

  async sumMonthExpenses(start: number, end: number): Promise<number> {
    const items = await this.getExpensesInRange(start, end);
    return items.filter(e => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0);
  },
};

export interface ExpenseQueryParams {
  startMillis: number; endMillis: number; typeFilter: TransactionTypeFilter; searchQuery: string;
}

