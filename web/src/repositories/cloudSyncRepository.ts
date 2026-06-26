import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { Category, Expense, SyncedPreferences } from '@/models/types';

export interface CloudCategory extends Category {
  updatedAt: number;
  deleted?: boolean;
}

export interface CloudExpense extends Expense {
  updatedAt: number;
  deleted?: boolean;
}

function categoriesRef(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'categories');
}

function expensesRef(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'expenses');
}

function categoryDoc(db: Firestore, uid: string, id: number) {
  return doc(db, 'users', uid, 'categories', String(id));
}

function expenseDoc(db: Firestore, uid: string, id: number) {
  return doc(db, 'users', uid, 'expenses', String(id));
}

function preferencesDoc(db: Firestore, uid: string) {
  return doc(db, 'users', uid, 'preferences', 'settings');
}

function now(): number {
  return Date.now();
}

function categoryPayload(category: Category, updatedAt = now(), deleted = false) {
  return {
    name: category.name,
    iconName: category.iconName,
    colorInt: category.colorInt,
    transactionType: category.transactionType,
    sortOrder: category.sortOrder,
    updatedAt,
    deleted,
  };
}

function expensePayload(expense: Expense, updatedAt = now(), deleted = false) {
  return {
    amount: expense.amount,
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    note: expense.note,
    receiptImagePath: expense.receiptImagePath ?? null,
    transactionType: expense.transactionType,
    updatedAt,
    deleted,
  };
}

function parseCategory(id: number, data: Record<string, unknown>): CloudCategory {
  return {
    id,
    name: String(data.name ?? ''),
    iconName: String(data.iconName ?? 'shopping_bag'),
    colorInt: Number(data.colorInt ?? 0xff6a9fd4),
    transactionType: data.transactionType as Category['transactionType'],
    sortOrder: Number(data.sortOrder ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    deleted: Boolean(data.deleted),
  };
}

function parseExpense(id: number, data: Record<string, unknown>): CloudExpense {
  return {
    id,
    amount: Number(data.amount ?? 0),
    dateMillis: Number(data.dateMillis ?? 0),
    categoryId: Number(data.categoryId ?? 0),
    note: String(data.note ?? ''),
    receiptImagePath: data.receiptImagePath ? String(data.receiptImagePath) : null,
    transactionType: data.transactionType as Expense['transactionType'],
    updatedAt: Number(data.updatedAt ?? data.dateMillis ?? 0),
    deleted: Boolean(data.deleted),
  };
}

export const cloudSyncRepository = {
  async pushCategory(db: Firestore, uid: string, category: Category): Promise<void> {
    if (category.id == null) return;
    const updatedAt = category.updatedAt ?? now();
    await setDoc(categoryDoc(db, uid, category.id), categoryPayload(category, updatedAt), { merge: true });
  },

  async pushExpense(db: Firestore, uid: string, expense: Expense): Promise<void> {
    if (expense.id == null) return;
    const updatedAt = expense.updatedAt ?? now();
    await setDoc(expenseDoc(db, uid, expense.id), expensePayload(expense, updatedAt), { merge: true });
  },

  async tombstoneCategory(db: Firestore, uid: string, id: number): Promise<void> {
    await setDoc(categoryDoc(db, uid, id), { deleted: true, updatedAt: now() }, { merge: true });
  },

  async tombstoneExpense(db: Firestore, uid: string, id: number): Promise<void> {
    await setDoc(expenseDoc(db, uid, id), { deleted: true, updatedAt: now() }, { merge: true });
  },

  async pullCategories(db: Firestore, uid: string): Promise<CloudCategory[]> {
    const snap = await getDocs(categoriesRef(db, uid));
    return snap.docs.map((d) => parseCategory(Number(d.id), d.data()));
  },

  async pullExpenses(db: Firestore, uid: string): Promise<CloudExpense[]> {
    const snap = await getDocs(expensesRef(db, uid));
    return snap.docs.map((d) => parseExpense(Number(d.id), d.data()));
  },

  async pushPreferences(db: Firestore, uid: string, prefs: SyncedPreferences): Promise<void> {
    await setDoc(preferencesDoc(db, uid), prefs, { merge: true });
  },

  async pullPreferences(db: Firestore, uid: string): Promise<SyncedPreferences | null> {
    const snap = await getDoc(preferencesDoc(db, uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      currency: String(data.currency ?? 'EUR'),
      locale: (data.locale ?? 'en') as SyncedPreferences['locale'],
      themeMode: data.themeMode as SyncedPreferences['themeMode'],
      dailyReminder: Boolean(data.dailyReminder ?? true),
      reminderHour: Number(data.reminderHour ?? 19),
      reminderMinute: Number(data.reminderMinute ?? 0),
      analyticsPeriod: String(data.analyticsPeriod ?? 'this_month'),
      monthlyBudget: data.monthlyBudget != null ? Number(data.monthlyBudget) : null,
      updatedAt: Number(data.updatedAt ?? 0),
    };
  },

  async pushAll(
    db: Firestore,
    uid: string,
    categories: Category[],
    expenses: Expense[],
  ): Promise<void> {
    await Promise.all([
      ...categories.filter((c) => c.id != null).map((c) => this.pushCategory(db, uid, c)),
      ...expenses.filter((e) => e.id != null).map((e) => this.pushExpense(db, uid, e)),
    ]);
  },
};
