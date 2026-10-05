import { describe, expect, it } from 'vitest';
import { analyticsDateRangeMillis } from '@/utils/periodUtils';
import type { Category, Expense } from '@/models/types';
import {
  filterRecordExpenses,
  parseRecordAmount,
  resolveCompatibleCategoryFilter,
  resolveCompatibleCategoryFilters,
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

describe('multi-category filtering (categoryIdsFilter)', () => {
  it('matches union (OR) of multiple selected categories', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdsFilter: ['cat-groceries', 'cat-transport'],
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('matches all when categoryIdsFilter is empty array', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdsFilter: [],
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('falls back to categoryIdFilter if categoryIdsFilter is undefined', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      categoryIdFilter: 'cat-salary',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e4']);
  });
});

describe('amount range filtering', () => {
  it('filters by minimum amount inclusive', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      minAmount: 30.0,
      categories,
    });
    // 45.0, 30.0, 2500.0, 200.0 (excludes 12.5)
    expect(result.map((e) => e.id)).toEqual(['e1', 'e3', 'e4', 'e5']);
  });

  it('filters by maximum amount inclusive', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      maxAmount: 45.0,
      categories,
    });
    // 45.0, 12.5, 30.0 (excludes 2500.0, 200.0)
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('filters by both min and max amounts', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      minAmount: 20.0,
      maxAmount: 100.0,
      categories,
    });
    // 45.0, 30.0
    expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('returns empty when minAmount > maxAmount', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      minAmount: 100.0,
      maxAmount: 50.0,
      categories,
    });
    expect(result).toEqual([]);
  });

  it('handles exact decimal boundaries with minor unit precision', () => {
    const result = filterRecordExpenses({
      expenses: sampleExpenses,
      typeFilter: 'all',
      minAmount: 12.5,
      maxAmount: 12.5,
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('sorting behavior', () => {
  const sortSamples: Expense[] = [
    createExpense({ id: 's1', amount: 10.0, dateMillis: 1000 }),
    createExpense({ id: 's2', amount: 50.0, dateMillis: 3000 }),
    createExpense({ id: 's3', amount: 50.0, dateMillis: 2000 }),
    createExpense({ id: 's4', amount: 5.0, dateMillis: 4000 }),
  ];

  it('sorts date_desc (newest first) by default with stable tie break', () => {
    const result = filterRecordExpenses({
      expenses: sortSamples,
      typeFilter: 'all',
      sortOrder: 'date_desc',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['s4', 's2', 's3', 's1']);
  });

  it('sorts date_asc (oldest first)', () => {
    const result = filterRecordExpenses({
      expenses: sortSamples,
      typeFilter: 'all',
      sortOrder: 'date_asc',
      categories,
    });
    expect(result.map((e) => e.id)).toEqual(['s1', 's3', 's2', 's4']);
  });

  it('sorts amount_desc (highest first) with date tie break', () => {
    const result = filterRecordExpenses({
      expenses: sortSamples,
      typeFilter: 'all',
      sortOrder: 'amount_desc',
      categories,
    });
    // s2 (50, 3000), s3 (50, 2000), s1 (10, 1000), s4 (5, 4000)
    expect(result.map((e) => e.id)).toEqual(['s2', 's3', 's1', 's4']);
  });

  it('sorts amount_asc (lowest first) with date tie break', () => {
    const result = filterRecordExpenses({
      expenses: sortSamples,
      typeFilter: 'all',
      sortOrder: 'amount_asc',
      categories,
    });
    // s4 (5, 4000), s1 (10, 1000), s2 (50, 3000), s3 (50, 2000)
    expect(result.map((e) => e.id)).toEqual(['s4', 's1', 's2', 's3']);
  });
});

describe('resolveCompatibleCategoryFilters (multi-category)', () => {
  it('preserves all existing categories when type is all', () => {
    const selected = ['cat-groceries', 'cat-salary'];
    expect(resolveCompatibleCategoryFilters(selected, 'all', categories)).toEqual(selected);
  });

  it('filters to only compatible categories when type changes', () => {
    const selected = ['cat-groceries', 'cat-transport', 'cat-salary'];
    expect(resolveCompatibleCategoryFilters(selected, 'expense', categories)).toEqual(['cat-groceries', 'cat-transport']);
    expect(resolveCompatibleCategoryFilters(selected, 'income', categories)).toEqual(['cat-salary']);
    expect(resolveCompatibleCategoryFilters(selected, 'transfer', categories)).toEqual([]);
  });

  it('removes nonexistent categories', () => {
    const selected = ['cat-groceries', 'missing-cat'];
    expect(resolveCompatibleCategoryFilters(selected, 'all', categories)).toEqual(['cat-groceries']);
  });
});

describe('composite multi-criteria filtering', () => {
  it('combines type, multi-category, amount range, search, and sort simultaneously', () => {
    const records: Expense[] = [
      createExpense({ id: 'r1', amount: 50.0, categoryId: 'cat-groceries', note: 'Weekly market', dateMillis: 1000 }),
      createExpense({ id: 'r2', amount: 80.0, categoryId: 'cat-groceries', note: 'Special market', dateMillis: 2000 }),
      createExpense({ id: 'r3', amount: 15.0, categoryId: 'cat-transport', note: 'Bus pass', dateMillis: 3000 }),
      createExpense({ id: 'r4', amount: 200.0, categoryId: 'cat-groceries', note: 'Bulk market stock', dateMillis: 4000 }),
      createExpense({ id: 'r5', amount: 60.0, categoryId: 'cat-salary', note: 'Market freelance', transactionType: 'income', dateMillis: 5000 }),
    ];

    const result = filterRecordExpenses({
      expenses: records,
      typeFilter: 'expense',
      categoryIdsFilter: ['cat-groceries'],
      minAmount: 40.0,
      maxAmount: 100.0,
      searchQuery: 'market',
      sortOrder: 'amount_desc',
      categories,
    });

    // Should match r2 (80.0) then r1 (50.0)
    expect(result.map((e) => e.id)).toEqual(['r2', 'r1']);
  });
});


describe('search and strict amount contract', () => {
  it.each(['-1', 'abc', '12x', '1.2345', 'Infinity', '1e2', '12.3.4'])('rejects invalid amount %s', input => {
    expect(parseRecordAmount(input)).toBeNull();
  });
  it('accepts decimal comma and dot without drift', () => {
    expect(parseRecordAmount('12,50')).toBe(12.5);
    expect(parseRecordAmount('12.50')).toBe(12.5);
    expect(parseRecordAmount('0')).toBe(0);
    expect(parseRecordAmount('1000000000000000000000000')).toBeNull();
  });
  it('matches trimmed case insensitive substrings of note/category only', () => {
    const params = { expenses: sampleExpenses, typeFilter: 'all' as const, categories };
    expect(filterRecordExpenses({ ...params, searchQuery: ' BAK ' }).map(e => e.id)).toEqual(['e2']);
    expect(filterRecordExpenses({ ...params, searchQuery: 'groc' }).map(e => e.id)).toEqual(['e1', 'e2']);
    for (const searchQuery of ['.*', 'cat-groceries', 'e1', '45', 'expense'])
      expect(filterRecordExpenses({ ...params, searchQuery })).toEqual([]);
    expect(filterRecordExpenses({ ...params, expenses: [], searchQuery: '' })).toEqual([]);
  });
  it('sorts equal amount/date ties by codepoint ID without mutating source', () => {
    const expenses = [createExpense({ id: 'z' }), createExpense({ id: 'a' })];
    for (const sortOrder of ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const)
      expect(filterRecordExpenses({ expenses, categories, typeFilter: 'all', sortOrder }).map(e => e.id)).toEqual(['a', 'z']);
    expect(expenses.map(e => e.id)).toEqual(['z', 'a']);
  });
});


it('filters a representative 25000-row corpus without per-row category scans', () => {
  const expenses = Array.from({ length: 25000 }, (_, i) => createExpense({ id: `row-${i}`, dateMillis: i,
    note: i === 1 ? 'old coffee' : 'other', amount: 12.5 }));
  const start = performance.now();
  for (let i = 0; i < 10; i++) expect(filterRecordExpenses({ expenses, categories, typeFilter: 'expense',
    searchQuery: 'coffee', minAmount: 12.5, maxAmount: 12.5, categoryIdsFilter: ['cat-groceries'] }).map(e => e.id)).toEqual(['row-1']);
  console.info(`Records benchmark: 25000 rows, mean ${((performance.now() - start) / 10).toFixed(2)} ms`);
});
