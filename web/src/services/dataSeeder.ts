import type { Category } from '@/models/types';

export const seedCategories: Omit<Category, 'id'>[] = [
  { name: 'Groceries', iconName: 'shopping_cart', colorInt: 0xffe86b5a, transactionType: 'expense', sortOrder: 0 },
  { name: 'Shopping', iconName: 'shopping_bag', colorInt: 0xffe8a060, transactionType: 'expense', sortOrder: 1 },
  { name: 'Dining', iconName: 'restaurant', colorInt: 0xffd4849a, transactionType: 'expense', sortOrder: 2 },
  { name: 'Transport', iconName: 'car', colorInt: 0xff6a9fd4, transactionType: 'expense', sortOrder: 3 },
  { name: 'Bills', iconName: 'bolt', colorInt: 0xff9a8fd4, transactionType: 'expense', sortOrder: 4 },
  { name: 'Subscriptions', iconName: 'subscriptions', colorInt: 0xff5ab8aa, transactionType: 'expense', sortOrder: 5 },
  { name: 'Salary', iconName: 'credit_card', colorInt: 0xff5cb88a, transactionType: 'income', sortOrder: 0 },
  { name: 'Freelance', iconName: 'work', colorInt: 0xff6a9fd4, transactionType: 'income', sortOrder: 1 },
  { name: 'Refunds', iconName: 'undo', colorInt: 0xffb8a060, transactionType: 'income', sortOrder: 2 },
  { name: 'Transfer', iconName: 'swap_horiz', colorInt: 0xff8e8e96, transactionType: 'transfer', sortOrder: 0 },
];
