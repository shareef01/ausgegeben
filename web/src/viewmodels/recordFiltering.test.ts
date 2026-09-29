import { describe, expect, it } from 'vitest';
import { analyticsDateRangeMillis } from '@/utils/periodUtils';
import type { Category, Expense } from '@/models/types';
import {
  filterRecordExpenses,
  resolveCompatibleCategoryFilter,
} from './useRecordViewModel';

const createCategory = (over: Partial<Category>): Category => ({
  id: 'cat-groceries',
  name: 'Groceries',
  iconName: 'shopping_cart',
  colorInt: -2345678,
  transactionType: 'expense',
  sortOrder: 0,
  ...over,
});

const createExpense = (over: Partial<Expense>): Expense => ({
  id: 'exp-1',
  amount: 25.5,
  dateMillis: 1700000000000,
  categoryId: 'cat-groceries',
  note: 'Weekly supermarket trip',
  transactionType: 'expense',
  ...over,
});

const categories: Category[] = [
  createCategory({ id: 'cat-groceries', name: 'Groceries', transactionType: 'expense' }),
  createCategory({ id: 'cat-transport', name: 'Transport', transactionType: 'expense' }),
  createCategory({ id: 'cat-salary', name: 'Salary', transactionType: 'income' }),
  createCategory({ id: 'cat-transfer', name: 'Savings Transfer', transactionType: 'transfer' }),
];

const sampleExpenses: Expense[] = [
  createExpense({ id: 'e1', amount: 45.0, categoryId: 'cat-groceries', note: 'Aldi groceries', transactionType: 'expense' }),
  createExpense({ id: 'e2', amount: 12.5, categoryId: 'cat-groceries', note: 'Bakery bread', transactionType: 'expense' }),
  createExpense({ id: 'e3', amount: 30.0, categoryId: 'cat-transport', note: 'Train ticket', transactionType: 'expense' }),
  createExpense({ id: 'e4', amount: 2500.0, categoryId: 'cat-salary', note: 'Monthly pay', transactionType: 'income' }),
  createExpense({ id: 'e5', amount: 200.0, categoryId: 'cat-transfer', note: 'To rainy day fund', transactionType: 'transfer' }),
];

describe('filterRecordExpenses', () => {
  it('returns all expenses when no filters are active', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: null,
      searchQuery: '',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('filters by categoryIdFilter alone', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: 'cat-groceries',
      searchQuery: '',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns empty array when categoryIdFilter matches no items', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: 'non-existent-cat',
      searchQuery: '',
      categories,
    });
    expect(result).toEqual([]);
  });

  it('combines typeFilter and categoryIdFilter', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'expense',
      categoryIdFilter: 'cat-transport',
      searchQuery: '',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e3']);
  });

  it('returns empty when typeFilter and categoryIdFilter are mutually exclusive', () => {
    // category is expense, but typeFilter is income
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'income',
      categoryIdFilter: 'cat-groceries',
      searchQuery: '',
      categories,
    });
    expect(result).toEqual([]);
  });

  it('combines categoryIdFilter and text search query', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: 'cat-groceries',
      searchQuery: 'bakery',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e2']);
  });

  it('search query does not escape categoryIdFilter boundary', () => {
    // 'Train' matches e3, but category filter is cat-groceries
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: 'cat-groceries',
      searchQuery: 'train',
      categories,
    });
    expect(result).toEqual([]);
  });
});

describe('resolveCompatibleCategoryFilter', () => {
  it('returns null when current category is null', () => {
    expect(resolveCompatibleCategoryFilter(null, 'expense', categories)).toBeNull();
  });

  it('preserves selection when switching to all types', () => {
    expect(resolveCompatibleCategoryFilter('cat-groceries', 'all', categories)).toBe('cat-groceries');
  });

  it('preserves selection when switching to compatible transaction type', () => {
    expect(resolveCompatibleCategoryFilter('cat-groceries', 'expense', categories)).toBe('cat-groceries');
    expect(resolveCompatibleCategoryFilter('cat-salary', 'income', categories)).toBe('cat-salary');
    expect(resolveCompatibleCategoryFilter('cat-transfer', 'transfer', categories)).toBe('cat-transfer');
  });

  it('resets selection to null when switching to incompatible transaction type', () => {
    expect(resolveCompatibleCategoryFilter('cat-groceries', 'income', categories)).toBeNull();
    expect(resolveCompatibleCategoryFilter('cat-salary', 'expense', categories)).toBeNull();
    expect(resolveCompatibleCategoryFilter('cat-transfer', 'expense', categories)).toBeNull();
  });

  it('resets selection to null if category does not exist', () => {
    expect(resolveCompatibleCategoryFilter('deleted-id', 'expense', categories)).toBeNull();
  });
});


describe('category composition and missing metadata', () => {
  it('intersects the period-scoped source and clearing preserves type and search', () => {
    const [start, end] = analyticsDateRangeMillis('month:2026-03')!;
    const records = [
      createExpense({ id: 'match', dateMillis: start, note: 'milk' }),
      createExpense({ id: 'otherCategory', dateMillis: start, categoryId: 'cat-transport', note: 'milk' }),
      createExpense({ id: 'otherMonth', dateMillis: end, note: 'milk' }),
      createExpense({ id: 'otherType', dateMillis: start, transactionType: 'income', note: 'milk' }),
      createExpense({ id: 'otherNote', dateMillis: start, note: 'bread' }),
    ];
    // The repository supplies the active period before client-side filtering.
    const expenses = records.filter((e) => e.dateMillis >= start && e.dateMillis < end);
    const params = { expenses, typeFilter: 'expense' as const, searchQuery: 'milk', categories };
    expect(filterRecordExpenses({ ...params, categoryIdFilter: 'cat-groceries' }).map((e) => e.id)).toEqual(['match']);
    expect(filterRecordExpenses({ ...params, categoryIdFilter: null }).map((e) => e.id)).toEqual(['match', 'otherCategory']);
  });

  it('filters by stable ID with missing metadata and identical category names', () => {
    const params = { expenses: sampleExpenses, typeFilter: 'all' as const, searchQuery: '', categoryIdFilter: 'cat-groceries' };
    expect(filterRecordExpenses({ ...params, categories: [] }).map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(filterRecordExpenses({ ...params, categories: categories.map((c) => ({ ...c, name: 'Same' })) }).map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});
