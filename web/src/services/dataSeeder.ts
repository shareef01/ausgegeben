import type { Category } from '@/models/types';

export const seedCategories: Omit<Category, 'id'>[] = [
  { cloudId: '1f2e1125-2a9f-42bd-8747-8901c7d14016', name: 'Groceries', iconName: 'shopping_cart', colorInt: 0xffe86b5a, transactionType: 'expense', sortOrder: 0 },
  { cloudId: '9bc5ceb6-9074-429b-a51e-575161edf1e3', name: 'Shopping', iconName: 'shopping_bag', colorInt: 0xffe8a060, transactionType: 'expense', sortOrder: 1 },
  { cloudId: '0d60f4c0-ee4e-43e1-986b-3556f9a5bec7', name: 'Dining', iconName: 'restaurant', colorInt: 0xffd4849a, transactionType: 'expense', sortOrder: 2 },
  { cloudId: 'fda6a539-33ba-4982-86cc-5893eb8c08dc', name: 'Transport', iconName: 'car', colorInt: 0xff6a9fd4, transactionType: 'expense', sortOrder: 3 },
  { cloudId: '00062709-f071-43b9-a23c-c6487e456f97', name: 'Bills', iconName: 'bolt', colorInt: 0xff9a8fd4, transactionType: 'expense', sortOrder: 4 },
  { cloudId: '8dfd6f47-76bb-4f66-979d-e2d82d49c9a7', name: 'Subscriptions', iconName: 'subscriptions', colorInt: 0xff5ab8aa, transactionType: 'expense', sortOrder: 5 },
  { cloudId: '62151dd1-e910-4714-a1be-cdf7be95beb7', name: 'Salary', iconName: 'credit_card', colorInt: 0xff5cb88a, transactionType: 'income', sortOrder: 0 },
  { cloudId: 'ff830f1d-cf14-4f95-b0d7-dc9f160fed51', name: 'Freelance', iconName: 'work', colorInt: 0xff6a9fd4, transactionType: 'income', sortOrder: 1 },
  { cloudId: '0ebe5034-1c55-48e4-84c0-721809530136', name: 'Refunds', iconName: 'undo', colorInt: 0xffb8a060, transactionType: 'income', sortOrder: 2 },
  { cloudId: '9a251df8-6d84-4603-a53b-ffe470dfa433', name: 'Transfer', iconName: 'swap_horiz', colorInt: 0xff8e8e96, transactionType: 'transfer', sortOrder: 0 },
];
