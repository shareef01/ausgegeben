import Dexie, { type Table } from 'dexie';
import { Category, Expense } from './models';

export class AppDatabase extends Dexie {
  categories!: Table<Category>;
  expenses!: Table<Expense>;

  constructor() {
    super('ausgegeben');
    this.version(1).stores({
      categories: '++id, transactionType, order',
      expenses: '++id, categoryId, transactionType, dateMillis'
    });
  }
}

export const db = new AppDatabase();

// Initial data
db.on('populate', () => {
  db.categories.bulkAdd([
    // Expenses
    { name: 'Food', iconName: 'utensils', colorInt: -16737281, transactionType: 'expense', order: 0 },
    { name: 'Dining Out', iconName: 'pizza', colorInt: -23296, transactionType: 'expense', order: 1 },
    { name: 'Transport', iconName: 'car', colorInt: -16776961, transactionType: 'expense', order: 2 },
    { name: 'Public Transport', iconName: 'bus', colorInt: -16741493, transactionType: 'expense', order: 3 },
    { name: 'Shopping', iconName: 'shopping-cart', colorInt: -10092544, transactionType: 'expense', order: 4 },
    { name: 'Home', iconName: 'home', colorInt: -16724737, transactionType: 'expense', order: 5 },
    { name: 'Phone', iconName: 'smartphone', colorInt: -6737204, transactionType: 'expense', order: 6 },
    { name: 'Entertainment', iconName: 'tv', colorInt: -10066330, transactionType: 'expense', order: 7 },
    { name: 'Health', iconName: 'stethoscop', colorInt: -16737281, transactionType: 'expense', order: 8 },
    { name: 'Travel', iconName: 'plane', colorInt: -16741493, transactionType: 'expense', order: 9 },

    // Income
    { name: 'Salary', iconName: 'banknote', colorInt: -16711936, transactionType: 'income', order: 0 },
    { name: 'Freelance', iconName: 'briefcase', colorInt: -16724737, transactionType: 'income', order: 1 },
    { name: 'Dividends', iconName: 'trending-up', colorInt: -16711936, transactionType: 'income', order: 2 },

    // Transfer
    { name: 'Savings', iconName: 'shield', colorInt: -6710887, transactionType: 'transfer', order: 0 },
  ]);
});
