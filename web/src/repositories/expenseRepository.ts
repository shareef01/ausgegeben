import { db, bumpRevision } from '@/services/database';
import { syncService } from '@/services/syncService';
import type { Category, Expense, TransactionType, TransactionTypeFilter } from '@/models/types';

export interface ExpenseQueryParams {
  startMillis: number;
  endMillis: number;
  typeFilter: TransactionTypeFilter;
  searchQuery: string;
}

export const expenseRepository = {
  async getAllCategories(): Promise<Category[]> {
    return db.categories.orderBy('sortOrder').toArray();
  },

  async getCategoriesByType(type: TransactionType): Promise<Category[]> {
    return db.categories.where('transactionType').equals(type).sortBy('sortOrder');
  },

  async insertCategory(category: Omit<Category, 'id'>): Promise<number> {
    const id = await db.categories.add(category as Category);
    bumpRevision();
    void syncService.pushCategory({ ...category, id });
    return id;
  },

  async updateCategory(category: Category): Promise<void> {
    await db.categories.put(category);
    bumpRevision();
    void syncService.pushCategory(category);
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

  async getAllExpenses(): Promise<Expense[]> {
    return db.expenses.orderBy('dateMillis').reverse().toArray();
  },

  async getExpensesInRange(start: number, end: number): Promise<Expense[]> {
    return db.expenses
      .where('dateMillis')
      .between(start, end, true, false)
      .reverse()
      .sortBy('dateMillis');
  },

  async queryExpenses(params: ExpenseQueryParams): Promise<Expense[]> {
    let items = await db.expenses
      .where('dateMillis')
      .between(params.startMillis, params.endMillis, true, false)
      .reverse()
      .sortBy('dateMillis');

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
    const id = await db.expenses.add(expense as Expense);
    bumpRevision();
    void syncService.pushExpense({ ...expense, id });
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    await db.expenses.put(expense);
    bumpRevision();
    void syncService.pushExpense(expense);
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
    const newId = await db.expenses.add(rest as Expense);
    bumpRevision();
    void syncService.pushExpense({ ...rest, id: newId });
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
