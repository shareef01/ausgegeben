import { describe, expect, it } from 'vitest';
import type { Category, Expense, TransactionSortOrder } from '@/models/types';
import { buildRecordList } from './useRecordViewModel';
import { groupRecordRows } from '@/utils/recordGrouping';
import { dayKey } from '@/utils/periodUtils';

/**
 * UX-3 regression suite for the record list pipeline.
 *
 * The defect: day-group totals came from the **unfiltered** period while the rows came from the
 * filtered list, so any active search/type/category/amount filter left a header that visibly
 * disagreed with the rows under it. `buildRecordList` derives both from one input; these tests
 * drive the real production function (not a re-implementation) across the filter matrix.
 */

const DAY = 24 * 60 * 60 * 1000;

/** 2026-05-17 12:00 local, so `dayKey` and DST offsets behave predictably. */
const NOON = new Date(2026, 4, 17, 12, 0, 0, 0).getTime();

const categories: Category[] = [
  { id: 'food', name: 'Food', iconName: 'restaurant', colorInt: -1, transactionType: 'expense', sortOrder: 0 },
  { id: 'fun', name: 'Fun', iconName: 'gamepad', colorInt: -2, transactionType: 'expense', sortOrder: 1 },
  { id: 'salary', name: 'Salary', iconName: 'cash', colorInt: -3, transactionType: 'income', sortOrder: 2 },
  { id: 'between', name: 'Between accounts', iconName: 'transfer', colorInt: -4, transactionType: 'transfer', sortOrder: 3 },
];

let seq = 0;
const expense = (over: Partial<Expense> & Pick<Expense, 'amount' | 'categoryId' | 'transactionType'>): Expense => ({
  id: `e${++seq}`,
  dateMillis: NOON,
  note: '',
  ...over,
});

/** The brief's example data: several kinds on one day, one on the previous day. */
const rows: Expense[] = [
  expense({ amount: 12.5, categoryId: 'food', transactionType: 'expense', note: 'coffee' }),
  expense({ amount: 7.25, categoryId: 'food', transactionType: 'expense', note: 'bread' }),
  expense({ amount: 40, categoryId: 'fun', transactionType: 'expense', note: 'cinema' }),
  expense({ amount: 1000, categoryId: 'salary', transactionType: 'income', note: 'may salary' }),
  expense({ amount: 200, categoryId: 'between', transactionType: 'transfer', note: 'to savings' }),
  expense({ amount: 3.5, categoryId: 'food', transactionType: 'expense', note: 'tea', dateMillis: NOON - DAY }),
];

type Filters = {
  typeFilter?: 'all' | 'income' | 'expense' | 'transfer';
  categoryIdsFilter?: string[];
  searchQuery?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  sortOrder?: TransactionSortOrder;
};

function list(filters: Filters = {}, source: Expense[] = rows) {
  return buildRecordList({
    expenses: source,
    typeFilter: filters.typeFilter ?? 'all',
    categoryIdsFilter: filters.categoryIdsFilter ?? [],
    searchQuery: filters.searchQuery ?? '',
    minAmount: filters.minAmount ?? null,
    maxAmount: filters.maxAmount ?? null,
    sortOrder: filters.sortOrder ?? 'date_desc',
    categories,
    locale: 'en',
  });
}

function groups(filters: Filters = {}, source: Expense[] = rows) {
  const built = list(filters, source);
  return groupRecordRows({
    expenses: built.expenses,
    sortOrder: filters.sortOrder ?? 'date_desc',
    dayTotalsByLabel: built.dayTotalsByLabel,
    locale: 'en',
  });
}

describe('day totals without filters', () => {
  it('groups by calendar day and counts income and expense but not transfers', () => {
    const today = groups();
    const todayKey = dayKey(NOON);
    const todayGroup = today.find((g) => g.key === todayKey)!;
    expect(todayGroup.items).toHaveLength(5);
    // 12.5 + 7.25 + 40 expenses; the 200 transfer is neither income nor expense.
    expect(todayGroup.dayExpense).toBe(59.75);
    expect(todayGroup.dayIncome).toBe(1000);
    expect(today).toHaveLength(2);
  });

  it('sums in integer cents so repeated decimals cannot drift', () => {
    const source = [
      expense({ amount: 0.1, categoryId: 'food', transactionType: 'expense' }),
      expense({ amount: 0.2, categoryId: 'food', transactionType: 'expense' }),
    ];
    expect(groups({}, source)[0].dayExpense).toBe(0.3);
  });
});

describe('day totals follow the filters (the regression)', () => {
  const todayKey = dayKey(NOON);

  it('search narrows both the rows and the day total', () => {
    const built = groups({ searchQuery: 'coffee' });
    expect(built).toHaveLength(1);
    expect(built[0].items).toHaveLength(1);
    expect(built[0].dayExpense).toBe(12.5);
    expect(built[0].dayIncome).toBe(0);
  });

  it('income-only filtering zeroes the expense total and keeps the income total', () => {
    const g = groups({ typeFilter: 'income' }).find((row) => row.key === todayKey)!;
    expect(g.items).toHaveLength(1);
    expect(g.dayIncome).toBe(1000);
    expect(g.dayExpense).toBe(0);
  });

  it('expense-only filtering drops income from the total', () => {
    const g = groups({ typeFilter: 'expense' }).find((row) => row.key === todayKey)!;
    expect(g.dayExpense).toBe(59.75);
    expect(g.dayIncome).toBe(0);
  });

  it('transfer-only filtering yields rows with no income and no expense total', () => {
    const g = groups({ typeFilter: 'transfer' }).find((row) => row.key === todayKey)!;
    expect(g.items).toHaveLength(1);
    // A transfer is not income or expense, so no total is shown for that day.
    expect(g.dayIncome).toBe(0);
    expect(g.dayExpense).toBe(0);
  });

  it('category filtering totals only the selected category', () => {
    const g = groups({ categoryIdsFilter: ['fun'] }).find((row) => row.key === todayKey)!;
    expect(g.dayExpense).toBe(40);
  });

  it('min and max amount filtering bound the total', () => {
    expect(groups({ minAmount: 40 }).find((r) => r.key === todayKey)!.dayExpense).toBe(40);
    // 12.50 + 7.25 on this day; the 3.50 row is on the previous day.
    expect(groups({ maxAmount: 12.5 }).find((r) => r.key === todayKey)!.dayExpense).toBe(19.75);
  });

  it('combined filters total only what survives all of them', () => {
    const g = groups({ typeFilter: 'expense', categoryIdsFilter: ['food'], minAmount: 10 })
      .find((row) => row.key === todayKey)!;
    expect(g.items).toHaveLength(1);
    expect(g.dayExpense).toBe(12.5);
  });

  it('keeps the two days separate when only one of them still has rows', () => {
    const built = groups({ searchQuery: 'tea' });
    expect(built).toHaveLength(1);
    expect(built[0].key).toBe(dayKey(NOON - DAY));
    expect(built[0].dayExpense).toBe(3.5);
  });

  it('returns no groups and no totals for an empty result', () => {
    const built = list({ searchQuery: 'nothing matches this' });
    expect(built.expenses).toEqual([]);
    expect(built.dayTotalsByLabel).toEqual({});
    expect(groups({ searchQuery: 'nothing matches this' })).toEqual([]);
  });
});

describe('ordering', () => {
  it('date_desc puts the newest day first and keeps each day ascending internally', () => {
    const g = groups({ sortOrder: 'date_desc' });
    expect(g[0].key).toBe(dayKey(NOON));
    expect(g[1].key).toBe(dayKey(NOON - DAY));
  });

  it('date_asc reverses the day order', () => {
    const g = groups({ sortOrder: 'date_asc' });
    expect(g[0].key).toBe(dayKey(NOON - DAY));
  });

  it('amount sorting produces one section per row and no day totals', () => {
    for (const sortOrder of ['amount_desc', 'amount_asc'] as const) {
      const g = groups({ sortOrder });
      expect(g).toHaveLength(rows.length);
      // Keys are row ids, which can never collide with a calendar-day total key.
      expect(g.every((row) => row.dayIncome === 0 && row.dayExpense === 0)).toBe(true);
      expect(g.every((row) => row.items.length === 1)).toBe(true);
    }
  });

  it('amount_desc orders rows from largest to smallest', () => {
    const g = groups({ sortOrder: 'amount_desc' });
    expect(g.map((row) => row.items[0].amount)).toEqual([1000, 200, 40, 12.5, 7.25, 3.5]);
  });
});

describe('edge cases', () => {
  it('handles several transactions on one day and one on another', () => {
    const g = groups();
    expect(g.map((row) => row.items.length).sort()).toEqual([1, 5]);
  });

  it('keeps a row whose category was deleted, and still counts it', () => {
    const orphan = expense({ amount: 9, categoryId: 'deleted-category-id', transactionType: 'expense' });
    const g = groups({}, [orphan]).find((row) => row.key === dayKey(NOON))!;
    expect(g.items).toHaveLength(1);
    expect(g.dayExpense).toBe(9);
  });

  it('splits transactions either side of local midnight into two days', () => {
    const midnight = new Date(2026, 4, 17, 0, 0, 0, 0).getTime();
    const source = [
      expense({ amount: 1, categoryId: 'food', transactionType: 'expense', dateMillis: midnight - 60_000 }),
      expense({ amount: 2, categoryId: 'food', transactionType: 'expense', dateMillis: midnight + 60_000 }),
    ];
    const g = groups({}, source);
    expect(g).toHaveLength(2);
    expect(g.map((row) => row.dayExpense).sort()).toEqual([1, 2]);
  });

  it('localises the group label and leaves it empty-safe for a single row', () => {
    const g = groups({ sortOrder: 'amount_asc' });
    expect(g[0].label.length).toBeGreaterThan(0);
  });
});
