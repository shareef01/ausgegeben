import { describe, expect, it } from 'vitest';
import type { Category, Expense } from '@/models/types';
import {
  computeAllTimeAverages,
  computeCashFlowTrend,
  computeCategoryMovers,
  computeDayTotals,
  computePeriodComparison,
  computeSpendingPace,
  computeTotals,
  csvEscapeField,
  exportCsv,
  groupByCategory,
  isExpense,
  isIncome,
  isTransfer,
  topExpenseCategoryName,
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

  it('topExpenseCategoryName picks the largest expense category', () => {
    expect(
      topExpenseCategoryName(
        [
          expense({ amount: 10, transactionType: 'expense', categoryId: 'a' }),
          expense({ amount: 40, transactionType: 'expense', categoryId: 'b' }),
          expense({ amount: 5, transactionType: 'expense', categoryId: 'a' }),
          expense({ amount: 999, transactionType: 'income', categoryId: 'b' }),
        ],
        { a: 'Groceries', b: 'Rent' },
      ),
    ).toBe('Rent');
    expect(topExpenseCategoryName([], { a: 'Groceries' })).toBeNull();
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
      'Unknown'
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
      'Unknown'
    );
    const [header, row] = csv.split('\n');
    expect(header).toBe('date,time,type,category,note,amount');
    expect(row).toBe('2026-06-10,00:30,expense,Food,late snack,9.50');
  });

  /**
   * Both clients must render an amount identically or the same expense exports
   * differently depending on which one produced the file. Kotlin's Double.toString()
   * gives "5.0"/"1.0E9" and JS's String() gives "5"/"1000000000"; two decimals is the
   * one rendering both can agree on. These expectations are the contract Android's
   * String.format(Locale.US, "%.2f", amount) is held to.
   */
  it('exportCsv renders amounts with exactly two decimals (Android parity)', () => {
    const categories: Category[] = [{ id: '1', name: 'Food', iconName: 'food', colorInt: 0, transactionType: 'expense', sortOrder: 0, updatedAt: 0 }];
    const amountCell = (amount: number) =>
      exportCsv(
        [expense({ amount, transactionType: 'expense', dateMillis: new Date(2026, 5, 10, 12).getTime(), categoryId: '1' })],
        categories,
        'Unknown',
      )
        .split('\n')[1]
        .split(',')
        .pop();

    expect(amountCell(5)).toBe('5.00');
    expect(amountCell(9.5)).toBe('9.50');
    expect(amountCell(0.01)).toBe('0.01');
    expect(amountCell(1234.5)).toBe('1234.50');
    // Never exponential within the range the rules permit (amount < 1e9).
    expect(amountCell(999999999)).toBe('999999999.00');
  });

  it('csvEscapeField quotes a bare carriage return', () => {
    // A lone CR ends the record for most parsers, so leaving it unquoted splits the
    // row. Android has always checked \r; the web escaper omitted it.
    expect(csvEscapeField('line1\rline2')).toBe('"line1\rline2"');
    expect(csvEscapeField('line1\r\nline2')).toBe('"line1\r\nline2"');
    // A leading CR is also a formula trigger, so it gets the apostrophe *and* quotes.
    expect(csvEscapeField('\rvalue')).toBe('"\'\rvalue"');
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
      'Unknown'
    );
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain('"Food, drink"');
  });

  describe('computePeriodComparison', () => {
    it('returns empty deltas when hasPriorData is false', () => {
      const comp = computePeriodComparison(150, 200, 0, 0, false);
      expect(comp.hasPriorData).toBe(false);
      expect(comp.expenseDelta).toBe(0);
      expect(comp.expensePercentageDelta).toBeNull();
      expect(comp.incomeDelta).toBe(0);
      expect(comp.incomePercentageDelta).toBeNull();
      expect(comp.netDelta).toBe(0);
    });

    it('computes accurate deltas and percentages with minor-unit precision', () => {
      const comp = computePeriodComparison(120.5, 300, 100, 200, true);
      expect(comp.hasPriorData).toBe(true);
      expect(comp.priorExpenses).toBe(100);
      expect(comp.priorIncome).toBe(200);
      expect(comp.expenseDelta).toBe(20.5);
      expect(comp.expensePercentageDelta).toBe(20.5); // (120.5 - 100) / 100 = +20.5%
      expect(comp.incomeDelta).toBe(100);
      expect(comp.incomePercentageDelta).toBe(50); // (300 - 200) / 200 = +50%
      // Current net: 300 - 120.5 = 179.5; Prior net: 200 - 100 = 100; Net delta: +79.5
      expect(comp.netDelta).toBe(79.5);
    });

    it('handles zero prior amounts gracefully without NaN or infinity', () => {
      const comp = computePeriodComparison(50, 80, 0, 0, true);
      expect(comp.expenseDelta).toBe(50);
      expect(comp.expensePercentageDelta).toBeNull();
      expect(comp.incomeDelta).toBe(80);
      expect(comp.incomePercentageDelta).toBeNull();
      expect(comp.netDelta).toBe(30);
    });
  });

  describe('computeSpendingPace', () => {
    it('returns null for null range', () => {
      expect(computeSpendingPace(500, null)).toBeNull();
    });

    it('computes pace and projection for active month', () => {
      // June 2026: June 1 to July 1 (30 days)
      const start = new Date(2026, 5, 1, 0, 0, 0).getTime();
      const end = new Date(2026, 6, 1, 0, 0, 0).getTime();
      // Test at June 10 (day 10)
      const now = new Date(2026, 5, 10, 15, 0, 0).getTime();
      // Spent 300 in 10 days => 30/day => projected 900 for 30 days
      const pace = computeSpendingPace(300, [start, end], now, 800);
      expect(pace).not.toBeNull();
      expect(pace?.daysElapsed).toBe(10);
      expect(pace?.daysInMonth).toBe(30);
      expect(pace?.dailyAverage).toBe(30);
      expect(pace?.projectedTotal).toBe(900);
      expect(pace?.budget).toBe(800);
      expect(pace?.projectedOverBudget).toBe(100);
    });

    it('returns null projectedOverBudget when projected spending is within budget', () => {
      const start = new Date(2026, 5, 1).getTime();
      const end = new Date(2026, 6, 1).getTime();
      const now = new Date(2026, 5, 10).getTime();
      const pace = computeSpendingPace(100, [start, end], now, 500);
      expect(pace?.projectedTotal).toBe(300);
      expect(pace?.projectedOverBudget).toBeNull();
    });

    it('handles past month as completed without extrapolating', () => {
      const start = new Date(2026, 4, 1).getTime();
      const end = new Date(2026, 5, 1).getTime(); // May (31 days)
      const now = new Date(2026, 5, 15).getTime(); // Viewed in June
      const pace = computeSpendingPace(620, [start, end], now, null);
      expect(pace?.daysElapsed).toBe(31);
      expect(pace?.dailyAverage).toBe(20);
      expect(pace?.projectedTotal).toBe(620);
      expect(pace?.projectedOverBudget).toBeNull();
    });
  });

  describe('computeCategoryMovers', () => {
    const categories: Category[] = [
      { id: 'c1', name: 'Dining', iconName: 'restaurant', colorInt: 0xff112233, transactionType: 'expense', sortOrder: 0, updatedAt: 0 },
      { id: 'c2', name: 'Groceries', iconName: 'cart', colorInt: 0xff445566, transactionType: 'expense', sortOrder: 1, updatedAt: 0 },
      { id: 'c3', name: 'Transport', iconName: 'car', colorInt: 0xff778899, transactionType: 'expense', sortOrder: 2, updatedAt: 0 },
      { id: 'c4', name: 'Entertainment', iconName: 'movie', colorInt: 0xffaabbcc, transactionType: 'expense', sortOrder: 3, updatedAt: 0 },
    ];

    it('identifies top movers sorted by absolute change', () => {
      const current = new Map([
        ['c1', 250], // delta: +150
        ['c2', 180], // delta: -20
        ['c3', 50],  // delta: -100
        ['c4', 60],  // delta: +10
      ]);
      const prior = new Map([
        ['c1', 100],
        ['c2', 200],
        ['c3', 150],
        ['c4', 50],
      ]);

      const movers = computeCategoryMovers(current, prior, categories, 3);
      expect(movers).toHaveLength(3);
      // Top mover: c1 (+150)
      expect(movers[0].categoryId).toBe('c1');
      expect(movers[0].categoryName).toBe('Dining');
      expect(movers[0].delta).toBe(150);
      expect(movers[0].percentageDelta).toBe(150);

      // Second mover: c3 (-100, |delta| = 100)
      expect(movers[1].categoryId).toBe('c3');
      expect(movers[1].delta).toBe(-100);
      expect(movers[1].percentageDelta).toBeCloseTo(-66.7, 1);

      // Third mover: c2 (-20, |delta| = 20)
      expect(movers[2].categoryId).toBe('c2');
      expect(movers[2].delta).toBe(-20);
    });

    it('handles categories not present in prior period', () => {
      const current = new Map([['c1', 80]]);
      const prior = new Map<string, number>();
      const movers = computeCategoryMovers(current, prior, categories);
      expect(movers).toHaveLength(1);
      expect(movers[0].delta).toBe(80);
      expect(movers[0].percentageDelta).toBeNull();
    });
  });

  describe('computeAllTimeAverages', () => {
    it('returns null for empty expenses', () => {
      expect(computeAllTimeAverages([])).toBeNull();
    });

    it('computes monthly averages across distinct calendar months', () => {
      const txns = [
        expense({ amount: 100, transactionType: 'expense', dateMillis: new Date(2026, 0, 10).getTime() }),
        expense({ amount: 50, transactionType: 'expense', dateMillis: new Date(2026, 0, 20).getTime() }),
        expense({ amount: 300, transactionType: 'income', dateMillis: new Date(2026, 0, 5).getTime() }),

        expense({ amount: 200, transactionType: 'expense', dateMillis: new Date(2026, 1, 15).getTime() }),
        expense({ amount: 500, transactionType: 'income', dateMillis: new Date(2026, 1, 1).getTime() }),

        expense({ amount: 999, transactionType: 'transfer', dateMillis: new Date(2026, 1, 2).getTime() }),
      ];

      const avg = computeAllTimeAverages(txns);
      expect(avg).not.toBeNull();
      expect(avg?.monthsCount).toBe(2);
      // Expenses: (150 + 200) / 2 = 175
      expect(avg?.averageMonthlyExpenses).toBe(175);
      // Income: (300 + 500) / 2 = 400
      expect(avg?.averageMonthlyIncome).toBe(400);
      // Net: 400 - 175 = 225
      expect(avg?.averageMonthlyNet).toBe(225);
    });
  });
});
