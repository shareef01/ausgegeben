import { db, bumpRevision } from '@/services/database';
import { syncService } from '@/services/syncService';
import { isCloudSyncActive } from '@/services/cloudSync';
import { usePreferencesStore } from '@/services/preferencesStore';
import { newCloudId, stampedForSync } from '@/utils/syncEntityUtils';
import { thisMonthRange } from '@/utils/periodUtils';
import type { Category, Expense, TransactionType, TransactionTypeFilter } from '@/models/types';

export interface ExpenseQueryParams {
  startMillis: number;
  endMillis: number;
  typeFilter: TransactionTypeFilter;
  searchQuery: string;
}

export interface ExpensePageResult {
  items: Expense[];
  hasMore: boolean;
}

export interface ExpenseTotalsResult {
  totalExpenses: number;
  totalIncome: number;
  count: number;
}

function needsFullExpenseScan(params: ExpenseQueryParams): boolean {
  return params.typeFilter !== 'all' || params.searchQuery.trim().length > 0;
}

export const expenseRepository = {
  async getAllCategories(): Promise<Category[]> {
    return db.categories.orderBy('sortOrder').toArray();
  },

  async getCategoriesByType(type: TransactionType): Promise<Category[]> {
    return db.categories.where('transactionType').equals(type).sortBy('sortOrder');
  },

  async findFallbackCategory(
    transactionType: TransactionType,
    excludeCloudId?: string,
  ): Promise<Category | undefined> {
    const items = await db.categories.where('transactionType').equals(transactionType).sortBy('sortOrder');
    return items.find((category) =>
      category.name !== 'Recovered' && category.cloudId !== excludeCloudId,
    ) ?? items.find((category) => category.cloudId !== excludeCloudId);
  },

  async insertCategory(category: Omit<Category, 'id' | 'cloudId' | 'updatedAt' | 'pendingSync'>): Promise<number> {
    const stamped = stampedForSync({ ...category, cloudId: newCloudId() });
    const id = await db.categories.add(stamped);
    bumpRevision();
    void syncService.pushCategory({ ...stamped, id });
    return id;
  },

  async updateCategory(category: Category): Promise<void> {
    if (category.id == null) return;
    const existing = await db.categories.get(category.id);
    if (!existing) return;
    const stamped = stampedForSync({ ...category, cloudId: existing.cloudId });
    await db.categories.put({ ...stamped, id: category.id });
    bumpRevision();
    void syncService.pushCategory({ ...stamped, id: category.id });
  },

  async countLinkedExpenses(categoryId: number): Promise<number> {
    return db.expenses.where('categoryId').equals(categoryId).count();
  },

  async moveCategory(category: Category, moveUp: boolean): Promise<void> {
    if (category.id == null) return;
    const sorted = await db.categories
      .where('transactionType')
      .equals(category.transactionType)
      .sortBy('sortOrder');
    const index = sorted.findIndex((c) => c.id === category.id);
    if (index < 0) return;
    const targetIndex = moveUp ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const current = sorted[index];
    const swap = sorted[targetIndex];
    await expenseRepository.updateCategory({ ...current, sortOrder: swap.sortOrder });
    await expenseRepository.updateCategory({ ...swap, sortOrder: current.sortOrder });
  },

  async deleteCategory(category: Category): Promise<void> {
    if (category.id == null) return;
    if (category.name === 'Recovered') {
      const fallback = await expenseRepository.findFallbackCategory(category.transactionType, category.cloudId);
      if (fallback?.id != null && fallback.id !== category.id) {
        const toReassign = await db.expenses.where('categoryId').equals(category.id).toArray();
        await expenseRepository.reassignExpenses(category.id, fallback.id);
        if (isCloudSyncActive()) {
          for (const expense of toReassign) {
            const updated = expense.id != null ? await db.expenses.get(expense.id) : undefined;
            if (updated) void syncService.pushExpense(updated);
          }
        }
      }
    }
    const linked = await db.expenses.where('categoryId').equals(category.id).toArray();
    if (isCloudSyncActive()) {
      for (const expense of linked) {
        try {
          await syncService.deleteExpense(expense);
        } catch {
          usePreferencesStore.getState().addPendingExpenseDelete(expense.cloudId);
        }
      }
      try {
        await syncService.deleteCategory(category);
      } catch {
        usePreferencesStore.getState().addPendingCategoryDelete(category.cloudId);
      }
    }
    await db.expenses.where('categoryId').equals(category.id).delete();
    await db.categories.delete(category.id);
    bumpRevision();
  },

  async reassignExpenses(oldCategoryId: number, newCategoryId: number): Promise<void> {
    await db.expenses.where('categoryId').equals(oldCategoryId).modify({ categoryId: newCategoryId });
    bumpRevision();
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

  async queryExpensesPage(params: ExpenseQueryParams, limit: number, offset: number): Promise<ExpensePageResult> {
    if (needsFullExpenseScan(params)) {
      const all = await expenseRepository.queryExpenses(params);
      const items = all.slice(offset, offset + limit);
      return { items, hasMore: offset + limit < all.length };
    }

    const chunk = await db.expenses
      .where('dateMillis')
      .between(params.startMillis, params.endMillis, true, false)
      .reverse()
      .offset(offset)
      .limit(limit + 1)
      .toArray();

    const hasMore = chunk.length > limit;
    return { items: chunk.slice(0, limit), hasMore };
  },

  async queryExpenseTotals(params: ExpenseQueryParams): Promise<ExpenseTotalsResult> {
    const q = params.searchQuery.trim().toLowerCase();
    const catMap = q
      ? new Map((await db.categories.toArray()).map((c) => [c.id!, c]))
      : null;

    let totalExpenses = 0;
    let totalIncome = 0;
    let count = 0;

    await db.expenses
      .where('dateMillis')
      .between(params.startMillis, params.endMillis, true, false)
      .each((expense) => {
        if (params.typeFilter !== 'all' && expense.transactionType !== params.typeFilter) return;

        if (q) {
          const cat = catMap?.get(expense.categoryId);
          const matches = (
            expense.note.toLowerCase().includes(q)
            || String(expense.amount).includes(q)
            || (cat?.name.toLowerCase().includes(q) ?? false)
          );
          if (!matches) return;
        }

        count += 1;
        if (expense.transactionType === 'expense') totalExpenses += expense.amount;
        else if (expense.transactionType === 'income') totalIncome += expense.amount;
      });

    return { totalExpenses, totalIncome, count };
  },

  async insertExpense(expense: Omit<Expense, 'id' | 'cloudId' | 'updatedAt' | 'pendingSync'>): Promise<number> {
    const stamped = stampedForSync({ ...expense, cloudId: newCloudId() });
    const id = await db.expenses.add(stamped);
    bumpRevision();
    void syncService.pushExpense({ ...stamped, id });
    return id;
  },

  async updateExpense(expense: Expense): Promise<void> {
    const stamped = stampedForSync(expense);
    await db.expenses.put({ ...stamped, id: expense.id });
    bumpRevision();
    void syncService.pushExpense({ ...stamped, id: expense.id });
  },

  async deleteExpense(id: number): Promise<Expense | null> {
    const expense = await db.expenses.get(id);
    if (!expense) return null;
    if (isCloudSyncActive()) {
      try {
        await syncService.deleteExpense(expense);
      } catch {
        usePreferencesStore.getState().addPendingExpenseDelete(expense.cloudId);
      }
    }
    await db.expenses.delete(id);
    bumpRevision();
    return expense;
  },

  async restoreExpense(expense: Expense): Promise<number> {
    const { id: _id, cloudId: _cloudId, ...rest } = expense;
    const stamped = stampedForSync({ ...rest, cloudId: newCloudId() });
    const newId = await db.expenses.add(stamped);
    bumpRevision();
    void syncService.pushExpense({ ...stamped, id: newId });
    return newId;
  },

  async sumMonthExpenses(excludeExpenseId = 0): Promise<number> {
    const [start, end] = thisMonthRange();
    const items = await db.expenses
      .where('dateMillis')
      .between(start, end, true, false)
      .toArray();
    return items
      .filter((e) => e.transactionType === 'expense' && e.id !== excludeExpenseId)
      .reduce((s, e) => s + e.amount, 0);
  },
};

export const categoryRepository = expenseRepository;
