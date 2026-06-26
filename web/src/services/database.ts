import Dexie, { type Table } from 'dexie';
import type { Category, Expense } from '@/models/types';
import { seedCategories } from '@/services/dataSeeder';

export class AusgegebenDatabase extends Dexie {
  categories!: Table<Category, number>;
  expenses!: Table<Expense, number>;

  constructor() {
    super('ausgegeben');
    this.version(1).stores({
      categories: '++id, transactionType, sortOrder',
      expenses: '++id, categoryId, transactionType, dateMillis',
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
