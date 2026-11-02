import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeAllTimeAverages,
  computeDayTotals,
  computePeriodComparison,
  computeSpendingPace,
  computeTotals,
  formatCsvAmount,
  groupByCategory,
} from '@/utils/analytics';
import { analyticsDateRangeMillis, dayKey } from '@/utils/periodUtils';
import { budgetAllocation, categoryBudgetProgress, type CategoryBudget } from '@/services/categoryBudgets';
import { createBackup } from '@/services/backupFormat';
import type { Category, Expense } from '@/models/types';

/**
 * Cross-platform financial parity: the same synthetic fixture is executed by
 * `app/src/test/java/com/aus/ausgegeben/util/FinancialParityTest.kt` through the Android
 * production functions. Every expectation here is derived by hand from the documented rules
 * in docs/maintenance.md ("Financial and category invariants"), not from either client's
 * output:
 *
 *  - amounts are summed in integer cents, so 0.10 + 0.20 is exactly 0.30;
 *  - transfers count toward neither spending nor income and are excluded from net;
 *  - soft-deleted expenses are excluded from every total and from budget spend;
 *  - a category being migrated is excluded from budget progress, and a budget whose category
 *    no longer exists is dropped;
 *  - day and month buckets follow the device's local calendar.
 *
 * The fixture is anchored to Europe/Berlin because both day bucketing and the DST month
 * length are local-time questions; the Android test pins the same zone.
 */
const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../testdata/financial-parity.json'), 'utf8'),
);
const expected = fixture.expected;

const categories: Category[] = fixture.categories;
const allExpenses: Expense[] = fixture.expenses;
/** The repository contract: soft-deleted rows never reach an aggregate. */
const liveExpenses: Expense[] = allExpenses.filter((e) => !e.deleted);

describe('financial parity fixture (shared with Android FinancialParityTest)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = fixture.timeZone;
  });
  afterAll(() => {
    // `process.env` coerces every value to a string, so assigning `undefined` would leave the
    // literal "undefined" behind as the zone for every later test in this worker. Restore the
    // variable's actual prior state instead.
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('sums totals in integer cents and keeps transfers out of spending and net', () => {
    const totals = computeTotals(liveExpenses);
    expect(totals.totalExpenses).toBe(expected.totals.totalExpenses);
    expect(totals.totalIncome).toBe(expected.totals.totalIncome);
    expect(totals.totalTransfers).toBe(expected.totals.totalTransfers);
    expect(totals.transferCount).toBe(expected.totals.transferCount);
    expect(totals.net).toBe(expected.totals.net);
  });

  it('groups category totals per transaction type, keeping an orphaned category row', () => {
    expect(Object.fromEntries(groupByCategory(liveExpenses, 'expense'))).toEqual(
      expected.expenseByCategory,
    );
    expect(Object.fromEntries(groupByCategory(liveExpenses, 'income'))).toEqual(
      expected.incomeByCategory,
    );
    expect(Object.fromEntries(groupByCategory(liveExpenses, 'transfer'))).toEqual(
      expected.transfersByCategory,
    );
  });

  it('buckets day totals by the local calendar, across the year and the DST switch', () => {
    // `dayKey` is web's internal bucket key with a zero-based month (`2026-0-15`), so the
    // fixture's ISO date is converted rather than compared literally.
    const bucketKey = (isoDate: string) => {
      const [y, m, d] = isoDate.split('-').map(Number);
      return `${y}-${m - 1}-${d}`;
    };
    const totals = computeDayTotals(liveExpenses);
    for (const [day, value] of Object.entries(expected.dayTotals) as [
      string,
      { income: number; expense: number },
    ][]) {
      expect(totals[bucketKey(day)], `day ${day}`).toEqual(value);
    }
    // Documented divergence, not a miscalculation: the web function emits a zero entry for a
    // transfer-only day, Android's omits the day entirely (transfers carry no daily total).
    const transferOnly = bucketKey(expected.dayTotalsTransferOnlyDay);
    const transferDay = allExpenses.find((e) => dayKey(e.dateMillis) === transferOnly);
    expect(transferDay?.transactionType).toBe('transfer');
    const zeroDays = Object.entries(totals)
      .filter(([, v]) => v.income === 0 && v.expense === 0)
      .map(([k]) => k);
    expect(zeroDays).toEqual([transferOnly]);
  });

  it('averages over the months that actually contain rows', () => {
    expect(computeAllTimeAverages(liveExpenses)).toEqual(expected.allTimeAverages);
  });

  it('computes budget spend, remaining and state from integer cents', () => {
    const budgets: CategoryBudget[] = fixture.budgets;
    // The deleted row is deliberately included in the input: the function, not the caller,
    // must exclude it.
    const progress = categoryBudgetProgress(budgets, categories, allExpenses).map((p) => ({
      categoryId: p.categoryId,
      spent: p.spent,
      remaining: p.remaining,
      overspent: p.overspent,
      percent: p.percent,
      state: p.state,
    }));
    expect(progress).toEqual(expected.budgetProgress);
  });

  it('allocates budgets against the global limit, clamping at zero', () => {
    const budgets: CategoryBudget[] = fixture.budgets;
    for (const alloc of expected.budgetAllocation) {
      const actual = budgetAllocation(budgets, alloc.global);
      expect(actual, `global ${alloc.global}`).toEqual({
        total: alloc.total,
        unallocated: alloc.unallocated,
        overAllocated: alloc.overAllocated,
      });
    }
  });

  it('compares periods on cent-exact deltas and one-decimal percentages', () => {
    const c = expected.periodComparison;
    const actual = computePeriodComparison(
      c.currentExpenses,
      c.currentIncome,
      c.priorExpenses,
      c.priorIncome,
      c.hasPriorData,
    );
    expect(actual.priorExpenses).toBe(c.priorExpensesResult);
    expect(actual.priorIncome).toBe(c.priorIncomeResult);
    expect(actual.expenseDelta).toBe(c.expenseDelta);
    expect(actual.expensePercentageDelta).toBe(c.expensePercentageDelta);
    expect(actual.incomeDelta).toBe(c.incomeDelta);
    expect(actual.incomePercentageDelta).toBe(c.incomePercentageDelta);
    expect(actual.netDelta).toBe(c.netDelta);
  });

  it('projects spending pace for active, past and future months', () => {
    for (const pace of expected.spendingPace) {
      const actual = computeSpendingPace(
        pace.currentExpenses,
        [pace.rangeStart, pace.rangeEnd],
        pace.nowMillis,
        pace.monthlyBudget,
      );
      expect(actual, pace.case).toEqual({
        daysElapsed: pace.daysElapsed,
        daysInMonth: pace.daysInMonth,
        dailyAverage: pace.dailyAverage,
        projectedTotal: pace.projectedTotal,
        budget: pace.budget,
        projectedOverBudget: pace.projectedOverBudget,
      });
    }
  });

  it('resolves month ranges at local midnight, including the DST month', () => {
    for (const [key, range] of Object.entries(expected.periodRanges) as [string, number[]][]) {
      expect(analyticsDateRangeMillis(key, 1768474800000), key).toEqual(range);
    }
  });

  it('renders CSV amounts with two decimals at every cent boundary', () => {
    for (const [amount, rendered] of Object.entries(expected.csvAmounts) as [string, string][]) {
      expect(formatCsvAmount(Number(amount)), amount).toBe(rendered);
    }
  });

  it('exports every live row at its exact amount and omits soft-deleted rows', () => {
    const backup = createBackup({
      preferences: { currency: fixture.currency, monthlyBudget: null },
      categories,
      expenses: allExpenses,
      appVersion: 'parity',
      categoryBudgets: fixture.budgets,
      schemaVersion: 3,
    });
    const ids = backup.expenses.map((e) => e.id).sort();
    expect(ids).toEqual([...expected.backupAmounts.includedIds].sort());
    for (const id of expected.backupAmounts.excludedIds) {
      expect(ids).not.toContain(id);
    }
    for (const row of backup.expenses) {
      const source = allExpenses.find((e) => e.id === row.id)!;
      expect(row.amount, row.id).toBe(source.amount);
    }
  });
});
