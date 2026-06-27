import Dexie, { type Table } from 'dexie';
import type { Category, Expense } from '@/models/types';
import type { StoredReceipt } from '@/services/receiptService';
import { seedCategories } from '@/services/dataSeeder';

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

export function bumpRevision(): void {
  window.dispatchEvent(new CustomEvent('ausgegeben:data-changed'));
}
