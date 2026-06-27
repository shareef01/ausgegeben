import { db, bumpRevision } from '@/services/database';
import { syncService } from '@/services/syncService';
import type { Category, Expense, TransactionType, TransactionTypeFilter } from '@/models/types';

export interface ExpenseQueryParams {
  startMillis: number;
  endMillis: number;
  typeFilter: TransactionTypeFilter;
  searchQuery: string;
}

function now(): number {
  return Date.now();
}

export const expenseRepository = {
  async getAllCategories(): Promise<Category[]> {
    return db.categories.orderBy('sortOrder').toArray();
  },

  async getCategoriesByType(type: TransactionType): Promise<Category[]> {
    return db.categories.where('transactionType').equals(type).sortBy('sortOrder');
  },

  async insertCategory(category: Omit<Category, 'id'>): Promise<number> {
    const stamped = { ...category, updatedAt: now() };
    const id = await db.categories.add(stamped as Category);
    bumpRevision();
    void syncService.pushCategory({ ...stamped, id });
    return id;
  },

  async updateCategory(category: Category): Promise<void> {
    const stamped = { ...category, updatedAt: now() };
    await db.categories.put(stamped);
    bumpRevision();
    void syncService.pushCategory(stamped);
  },

  async deleteCategory(id: number): Promise<void> {
    const linked = await db.expenses.where('categoryId').equals(id).toArray();
    await db.expenses.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
    bumpRevision();
    void syncService.deleteCategory(id);
    for (const expense of linked) {
      if (expense.id != null) void syncService.deleteExpense(expense.id);
    }
  },

  async getExpenseById(id: number): Promise<Expense | undefined> {
    return db.expenses.get(id);
  },

  async getAllExpenses(): Promise<Expense[]> {
    return db.expenses.orderBy('dateMillis').reverse().toArray();
  },

  async getExpensesInRange(start: number, end: number): Promise<Expense[]> {
    return db.expenses
      .where('dateMillis')
      .between(start, end, true, false)
      .reverse()
      .toArray();
  },

  async queryExpenses(params: ExpenseQueryParams): Promise<Expense[]> {
    let items = await db.expenses
      .where('dateMillis')
      .between(params.startMillis, params.endMillis, true, false)
      .reverse()
      .toArray();

    if (params.typeFilter !== 'all') {
      items = items.filter((e) => e.transactionType === params.typeFilter);
    }

    const q = params.searchQuery.trim().toLowerCase();
    if (q) {
      const categories = await db.categories.toArray();
      const catMap = new Map(categories.map((c) => [c.id!, c]));
      items = items.filter((e) => {
        const cat = catMap.get(e.categoryId);
        return (
          e.note.toLowerCase().includes(q) ||
          String(e.amount).includes(q) ||
          (cat?.name.toLowerCase().includes(q) ?? false)
        );
      });
    }

    return items;
  },

  async insertExpense(expense: Omit<Expense, 'id'>): Promise<number> {
    const stamped = { ...expense, updatedAt: now() };
    const id = await db.expenses.add(stamped as Expense);
    bumpRevision();
    void syncService.pushExpense({ ...stamped, id });
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    const stamped = { ...expense, updatedAt: now() };
    await db.expenses.put(stamped);
    bumpRevision();
    void syncService.pushExpense(stamped);
  },

  async deleteExpense(id: number): Promise<Expense | null> {
    const expense = await db.expenses.get(id);
    if (!expense) return null;
    await db.expenses.delete(id);
    bumpRevision();
    void syncService.deleteExpense(id);
    return expense;
  },

  async restoreExpense(expense: Expense): Promise<number> {
    const { id: _id, ...rest } = expense;
    const stamped = { ...rest, updatedAt: now() };
    const newId = await db.expenses.add(stamped as Expense);
    bumpRevision();
    void syncService.pushExpense({ ...stamped, id: newId });
    return newId;
  },

  async sumMonthExpenses(start: number, end: number): Promise<number> {
    const items = await db.expenses
      .where('dateMillis')
      .between(start, end, true, false)
      .toArray();
    return items.filter((e) => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0);
  },
};

export const categoryRepository = expenseRepository;
