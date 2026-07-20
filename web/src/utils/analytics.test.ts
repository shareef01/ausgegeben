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

  it('computeCashFlowTrend includes the most-recent transaction (no boundary drop)', () => {
    const base = new Date(2026, 0, 1).getTime();
    const day = 86_400_000;
    const txns = [
      expense({ amount: 100, transactionType: 'expense', dateMillis: base }),
      expense({ amount: 50, transactionType: 'income', dateMillis: base + day }),
      // Latest transaction sits exactly at `end` — previously dropped by the exclusive bound.
      expense({ amount: 120, transactionType: 'expense', dateMillis: base + 6 * day }),
    ];
    const trend = computeCashFlowTrend(txns);
    const totalExpense = trend.reduce((s, p) => s + p.expense, 0);
    const totalIncome = trend.reduce((s, p) => s + p.income, 0);
    // Trend totals must match the raw totals — every transaction is bucketed.
    expect(totalExpense).toBe(220);
    expect(totalIncome).toBe(50);
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
