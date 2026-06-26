import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { Category, Expense } from '@/models/types';

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

function categoryPayload(category: Category) {
  return {
    name: category.name,
    iconName: category.iconName,
    colorInt: category.colorInt,
    transactionType: category.transactionType,
    sortOrder: category.sortOrder,
  };
}

function expensePayload(expense: Expense) {
  return {
    amount: expense.amount,
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    note: expense.note,
    receiptImagePath: expense.receiptImagePath ?? null,
    transactionType: expense.transactionType,
  };
}

export const cloudSyncRepository = {
  async pushCategory(db: Firestore, uid: string, category: Category): Promise<void> {
    if (category.id == null) return;
    await setDoc(categoryDoc(db, uid, category.id), categoryPayload(category), { merge: true });
  },

  async pushExpense(db: Firestore, uid: string, expense: Expense): Promise<void> {
    if (expense.id == null) return;
    await setDoc(expenseDoc(db, uid, expense.id), expensePayload(expense), { merge: true });
  },

  async deleteCategory(db: Firestore, uid: string, id: number): Promise<void> {
    await deleteDoc(categoryDoc(db, uid, id));
  },

  async deleteExpense(db: Firestore, uid: string, id: number): Promise<void> {
    await deleteDoc(expenseDoc(db, uid, id));
  },

  async pullCategories(db: Firestore, uid: string): Promise<Category[]> {
    const snap = await getDocs(categoriesRef(db, uid));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: Number(d.id),
        name: String(data.name ?? ''),
        iconName: String(data.iconName ?? 'shopping_bag'),
        colorInt: Number(data.colorInt ?? 0xff6a9fd4),
        transactionType: data.transactionType as Category['transactionType'],
        sortOrder: Number(data.sortOrder ?? 0),
      };
    });
  },

  async pullExpenses(db: Firestore, uid: string): Promise<Expense[]> {
    const snap = await getDocs(expensesRef(db, uid));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: Number(d.id),
        amount: Number(data.amount ?? 0),
        dateMillis: Number(data.dateMillis ?? 0),
        categoryId: Number(data.categoryId ?? 0),
        note: String(data.note ?? ''),
        receiptImagePath: data.receiptImagePath ? String(data.receiptImagePath) : null,
        transactionType: data.transactionType as Expense['transactionType'],
      };
    });
  },

  async pushAll(db: Firestore, uid: string, categories: Category[], expenses: Expense[]): Promise<void> {
    await Promise.all([
      ...categories.filter((c) => c.id != null).map((c) => this.pushCategory(db, uid, c)),
      ...expenses.filter((e) => e.id != null).map((e) => this.pushExpense(db, uid, e)),
    ]);
  },
};
