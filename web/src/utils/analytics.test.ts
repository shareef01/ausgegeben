import { describe, expect, it } from 'vitest';
import type { Category, Expense } from '@/models/types';
import {
  computeCashFlowTrend,
  computeDayTotals,
  computeTotals,
  exportCsv,
  groupByCategory,
  isExpense,
  isIncome,
  isTransfer,
} from '@/utils/analytics';

function expense(partial: Partial<Expense> & Pick<Expense, 'amount' | 'transactionType'>): Expense {
  return {
    id: 'test-id',
    dateMillis: Date.now(),
    categoryId: '1',
    note: '',
    updatedAt: Date.now(),
    ...partial,
  } as Expense;
}

describe('analytics', () => {
  it('classifies transaction types', () => {
    expect(isExpense({ transactionType: 'expense' })).toBe(true);
    expect(isIncome({ transactionType: 'income' })).toBe(true);
    expect(isTransfer(expense({ amount: 1, transactionType: 'transfer' }))).toBe(true);
  });

  it('computeTotals separates expense, income, and transfers', () => {
    const totals = computeTotals([
      expense({ amount: 30, transactionType: 'expense' }),
      expense({ amount: 100, transactionType: 'income' }),
      expense({ amount: 20, transactionType: 'transfer' }),
    ]);
    expect(totals.totalExpenses).toBe(30);
    expect(totals.totalIncome).toBe(100);
    expect(totals.totalTransfers).toBe(20);
    expect(totals.net).toBe(70);
  });

  it('groupByCategory sums per category', () => {
    const map = groupByCategory(
      [
        expense({ amount: 10, transactionType: 'expense', categoryId: '1' }),
        expense({ amount: 5, transactionType: 'expense', categoryId: '1' }),
        expense({ amount: 7, transactionType: 'income', categoryId: '2' }),
      ],
      'expense',
    );
    expect(map.get('1')).toBe(15);
    expect(map.has('2')).toBe(false);
  });

  it('computeDayTotals ignores transfers', () => {
    const day = new Date(2026, 5, 10, 12).getTime();
    const totals = computeDayTotals([
      expense({ amount: 12, transactionType: 'expense', dateMillis: day }),
      expense({ amount: 40, transactionType: 'income', dateMillis: day }),
      expense({ amount: 99, transactionType: 'transfer', dateMillis: day }),
    ]);
    const key = '2026-5-10';
    expect(totals[key]?.expense).toBe(12);
    expect(totals[key]?.income).toBe(40);
  });

  it('computeCashFlowTrend returns empty for no expenses', () => {
    expect(computeCashFlowTrend([])).toEqual([]);
  });

  it('computeCashFlowTrend buckets all transactions (all-time: one bucket per month with data)', () => {
    const txns = [
      expense({ amount: 100, transactionType: 'expense', dateMillis: new Date(2026, 0, 1).getTime() }),
      expense({ amount: 50, transactionType: 'income', dateMillis: new Date(2026, 0, 15).getTime() }),
      expense({ amount: 120, transactionType: 'expense', dateMillis: new Date(2026, 2, 10).getTime() }),
      expense({ amount: 999, transactionType: 'transfer', dateMillis: new Date(2026, 2, 11).getTime() }),
    ];
    const trend = computeCashFlowTrend(txns);
    // Jan and Mar have data; Feb (empty) is skipped, transfers excluded — matches Android.
    expect(trend).toHaveLength(2);
    expect(trend.reduce((s, p) => s + p.expense, 0)).toBe(220);
    expect(trend.reduce((s, p) => s + p.income, 0)).toBe(50);
  });

  it('computeCashFlowTrend uses zero-filled daily buckets for month periods (Android parity)', () => {
    const txns = [
      expense({ amount: 30, transactionType: 'expense', dateMillis: new Date(2026, 5, 5, 12).getTime() }),
      expense({ amount: 70, transactionType: 'income', dateMillis: new Date(2026, 5, 20, 9).getTime() }),
    ];
    const trend = computeCashFlowTrend(txns, 'month:2026-06');
    expect(trend).toHaveLength(30); // every day of June, gaps zero-filled
    expect(trend[4].expense).toBe(30);
    expect(trend[19].income).toBe(70);
    expect(trend.reduce((s, p) => s + p.expense, 0)).toBe(30);
    expect(trend.reduce((s, p) => s + p.income, 0)).toBe(70);
  });

  it('exportCsv quotes notes with commas', () => {
    const categories: Category[] = [{ id: '1', name: 'Food', iconName: 'food', colorInt: 0, transactionType: 'expense', sortOrder: 0, updatedAt: 0 }];
    const csv = exportCsv(
      [
        expense({
          amount: 9.5,
          transactionType: 'expense',
          note: 'Coffee, pastry',
          dateMillis: new Date(2026, 5, 10, 14, 30).getTime(),
          categoryId: '1'
        }),
      ],
      categories,
    );
    expect(csv).toContain('"Coffee, pastry"');
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('exportCsv matches the Android column layout with local date and time', () => {
    const categories: Category[] = [{ id: '1', name: 'Food', iconName: 'food', colorInt: 0, transactionType: 'expense', sortOrder: 0, updatedAt: 0 }];
    const csv = exportCsv(
      [
        expense({
          amount: 9.5,
          transactionType: 'expense',
          note: 'late snack',
          // Just after local midnight — a UTC-based date would report the wrong day
          dateMillis: new Date(2026, 5, 10, 0, 30).getTime(),
          categoryId: '1',
        }),
      ],
      categories,
    );
    const [header, row] = csv.split('\n');
    expect(header).toBe('date,time,type,category,note,amount');
    expect(row).toBe('2026-06-10,00:30,expense,Food,late snack,9.5');
  });

  it('exportCsv neutralizes formula triggers and escapes category names', () => {
    const categories: Category[] = [{ id: '1', name: 'Food, drink', iconName: 'food', colorInt: 0, transactionType: 'expense', sortOrder: 0, updatedAt: 0 }];
    const csv = exportCsv(
      [
        expense({
          amount: 5,
          transactionType: 'expense',
          note: '=SUM(A1:A9)',
          dateMillis: new Date(2026, 5, 10, 14, 30).getTime(),
          categoryId: '1'
        }),
      ],
      categories,
    );
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain('"Food, drink"');
  });
});
