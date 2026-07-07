import Dexie, { type Table } from 'dexie';
import type { Category, Expense } from '@/models/types';
import type { StoredReceipt } from '@/services/receiptService';
import { seedCategories } from '@/services/dataSeeder';
import { invalidateCategoryCache, preloadCategories } from '@/services/categoryCache';
import { newCloudId } from '@/utils/syncEntityUtils';

export class AusgegebenDatabase extends Dexie {
  categories!: Table<Category, number>;
  expenses!: Table<Expense, number>;
  receipts!: Table<StoredReceipt, string>;

  constructor() {
    super('ausgegeben');
    this.version(1).stores({
      categories: '++id, transactionType, sortOrder',
      expenses: '++id, categoryId, transactionType, dateMillis',
    });
    this.version(2).stores({
      categories: '++id, transactionType, sortOrder',
      expenses: '++id, categoryId, transactionType, dateMillis, receiptImagePath',
      receipts: 'id',
    });
    this.version(3).stores({
      categories: '++id, &cloudId, transactionType, sortOrder',
      expenses: '++id, &cloudId, categoryId, transactionType, dateMillis, receiptImagePath',
      receipts: 'id',
    }).upgrade(async (tx) => {
      const now = Date.now();
      const categories = await tx.table<Category>('categories').toArray();
      for (const category of categories) {
        if (!category.cloudId) {
          await tx.table('categories').update(category.id!, {
            cloudId: newCloudId(),
            updatedAt: category.updatedAt ?? now,
            pendingSync: true,
          });
        }
      }
      const expenses = await tx.table<Expense>('expenses').toArray();
      for (const expense of expenses) {
        if (!expense.cloudId) {
          await tx.table('expenses').update(expense.id!, {
            cloudId: newCloudId(),
            updatedAt: expense.updatedAt ?? expense.dateMillis ?? now,
            pendingSync: true,
          });
        }
      }
    });
  }
}

export const db = new AusgegebenDatabase();

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd(seedCategories);
  }
  seeded = true;
}

/** Wipes user data tables and re-seeds defaults (account switch). */
export async function clearLocalUserData(): Promise<void> {
  await db.transaction('rw', db.categories, db.expenses, db.receipts, async () => {
    await db.categories.clear();
    await db.expenses.clear();
    await db.receipts.clear();
  });
  seeded = false;
  invalidateCategoryCache();
  await ensureSeeded();
  await preloadCategories();
  bumpRevision();
}

export function bumpRevision(): void {
  window.dispatchEvent(new CustomEvent('ausgegeben:data-changed'));
}

export async function getCategoryByCloudId(cloudId: string): Promise<Category | undefined> {
  return db.categories.where('cloudId').equals(cloudId).first();
}

export async function getExpenseByCloudId(cloudId: string): Promise<Expense | undefined> {
  return db.expenses.where('cloudId').equals(cloudId).first();
}

export async function clearCategoryPendingSync(cloudIds: string[]): Promise<void> {
  if (cloudIds.length === 0) return;
  await db.categories.where('cloudId').anyOf(cloudIds).modify({ pendingSync: false });
}

export async function clearExpensePendingSync(cloudIds: string[]): Promise<void> {
  if (cloudIds.length === 0) return;
  await db.expenses.where('cloudId').anyOf(cloudIds).modify({ pendingSync: false });
}

export async function patchCategoryUpdatedAt(cloudId: string, updatedAt: number): Promise<void> {
  if (updatedAt <= 0) return;
  await db.categories.where('cloudId').equals(cloudId).modify({ updatedAt, pendingSync: false });
}

export async function patchExpenseUpdatedAt(cloudId: string, updatedAt: number): Promise<void> {
  if (updatedAt <= 0) return;
  await db.expenses.where('cloudId').equals(cloudId).modify({ updatedAt, pendingSync: false });
}
