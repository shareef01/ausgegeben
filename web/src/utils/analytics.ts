import type {
  Expense,
  Category,
  CashFlowPoint,
  PeriodComparison,
  SpendingPace,
  CategoryMover,
  AllTimeAverages,
} from '@/models/types';
import { analyticsDateRangeMillis, dayKey } from '@/utils/periodUtils';
import { getLocale, localeTag } from '@/i18n';
import { fromMinorUnits, toMinorUnits } from '@/utils/money';

export function isExpense(e: { transactionType: string }): boolean {
  return e.transactionType === 'expense';
}

export function isIncome(e: { transactionType: string }): boolean {
  return e.transactionType === 'income';
}

export function isTransfer(e: Expense): boolean {
  return e.transactionType === 'transfer';
}

export function computeTotals(expenses: Expense[]) {
  let totalExpensesMinor = 0;
  let totalIncomeMinor = 0;
  let totalTransfersMinor = 0;
  for (const e of expenses) {
    const minor = toMinorUnits(e.amount);
    if (isExpense(e)) totalExpensesMinor += minor;
    else if (isIncome(e)) totalIncomeMinor += minor;
    else totalTransfersMinor += minor;
  }
  return {
    totalExpenses: fromMinorUnits(totalExpensesMinor),
    totalIncome: fromMinorUnits(totalIncomeMinor),
    totalTransfers: fromMinorUnits(totalTransfersMinor),
    net: fromMinorUnits(totalIncomeMinor - totalExpensesMinor),
  };
}

/** Top expense category for the given set (Android computeSpendingInsights parity). */
export function topExpenseCategoryName(
  expenses: Expense[],
  categoryNames: Map<string, string> | Record<string, string>,
): string | null {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    if (!isExpense(e)) continue;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + toMinorUnits(e.amount));
  }
  let bestId: string | null = null;
  let bestAmount = 0;
  for (const [id, amount] of totals) {
    if (amount > bestAmount) {
      bestId = id;
      bestAmount = amount;
    }
  }
  if (!bestId || bestAmount <= 0) return null;
  const name = categoryNames instanceof Map ? categoryNames.get(bestId) : categoryNames[bestId];
  return name?.trim() ? name : null;
}

export function groupByCategory(expenses: Expense[], type: Expense['transactionType']): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.transactionType !== type) continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + toMinorUnits(e.amount));
  }
  for (const [key, value] of map) {
    map.set(key, fromMinorUnits(value));
  }
  return map;
}

export function computeDayTotals(expenses: Expense[]): Record<string, { income: number; expense: number }> {
  const result: Record<string, { income: number; expense: number }> = {};
  for (const e of expenses) {
    const label = dayKey(e.dateMillis);
    if (!result[label]) result[label] = { income: 0, expense: 0 };
    if (isIncome(e)) result[label].income = fromMinorUnits(
      toMinorUnits(result[label].income) + toMinorUnits(e.amount),
    );
    if (isExpense(e)) result[label].expense = fromMinorUnits(
      toMinorUnits(result[label].expense) + toMinorUnits(e.amount),
    );
  }
  return result;
}

function monthBucketStart(millis: number): number {
  const d = new Date(millis);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function dayBucketStart(millis: number): number {
  const d = new Date(millis);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Same bucketing as Android WealthTrend.computeCashFlowTrend: month periods get
 * one zero-filled bucket per calendar day; all-time gets one bucket per month
 * that has data. Transfers are excluded from both series.
 */
export function computeCashFlowTrend(expenses: Expense[], periodKey = 'all_time'): CashFlowPoint[] {
  const billable = expenses.filter((e) => !isTransfer(e));
  if (billable.length === 0) return [];
  const tag = localeTag(getLocale());
  const range = analyticsDateRangeMillis(periodKey === 'all_time' ? 'all_time' : periodKey);

  let buckets: { start: number; label: string }[];
  let keyFor: (millis: number) => number;

  if (range === null) {
    const monthFmt = new Intl.DateTimeFormat(tag, { month: 'short', year: '2-digit' });
    keyFor = monthBucketStart;
    buckets = [...new Set(billable.map((e) => monthBucketStart(e.dateMillis)))]
      .sort((a, b) => a - b)
      .map((start) => ({ start, label: monthFmt.format(new Date(start)) }));
  } else {
    const dayFmt = new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' });
    keyFor = dayBucketStart;
    buckets = [];
    const cursor = new Date(range[0]);
    const end = dayBucketStart(range[1] - 1);
    while (cursor.getTime() <= end) {
      buckets.push({ start: cursor.getTime(), label: dayFmt.format(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const byBucket = new Map<number, { income: number; expense: number }>();
  for (const e of billable) {
    const key = keyFor(e.dateMillis);
    const entry = byBucket.get(key) ?? { income: 0, expense: 0 };
    if (isIncome(e)) entry.income += toMinorUnits(e.amount);
    if (isExpense(e)) entry.expense += toMinorUnits(e.amount);
    byBucket.set(key, entry);
  }

  return buckets.map(({ start, label }) => {
    const entry = byBucket.get(start);
    return {
      label,
      income: fromMinorUnits(entry?.income ?? 0),
      expense: fromMinorUnits(entry?.expense ?? 0),
    };
  });
}

export function computePeriodComparison(
  currentExpenses: number,
  currentIncome: number,
  priorExpenses: number,
  priorIncome: number,
  hasPriorData: boolean,
): PeriodComparison {
  if (!hasPriorData) {
    return {
      hasPriorData: false,
      priorExpenses: 0,
      priorIncome: 0,
      expenseDelta: 0,
      expensePercentageDelta: null,
      incomeDelta: 0,
      incomePercentageDelta: null,
      netDelta: 0,
    };
  }

  const currentExpMinor = toMinorUnits(currentExpenses);
  const priorExpMinor = toMinorUnits(priorExpenses);
  const currentIncMinor = toMinorUnits(currentIncome);
  const priorIncMinor = toMinorUnits(priorIncome);

  const expenseDelta = fromMinorUnits(currentExpMinor - priorExpMinor);
  const incomeDelta = fromMinorUnits(currentIncMinor - priorIncMinor);
  const currentNetMinor = currentIncMinor - currentExpMinor;
  const priorNetMinor = priorIncMinor - priorExpMinor;
  const netDelta = fromMinorUnits(currentNetMinor - priorNetMinor);

  const expensePercentageDelta =
    priorExpMinor > 0
      ? Math.round(((currentExpMinor - priorExpMinor) / priorExpMinor) * 1000) / 10
      : null;

  const incomePercentageDelta =
    priorIncMinor > 0
      ? Math.round(((currentIncMinor - priorIncMinor) / priorIncMinor) * 1000) / 10
      : null;

  return {
    hasPriorData: true,
    priorExpenses: fromMinorUnits(priorExpMinor),
    priorIncome: fromMinorUnits(priorIncMinor),
    expenseDelta,
    expensePercentageDelta,
    incomeDelta,
    incomePercentageDelta,
    netDelta,
  };
}

export function computeSpendingPace(
  currentExpenses: number,
  rangeMillis: [number, number] | null,
  nowMillis = Date.now(),
  monthlyBudget: number | null = null,
): SpendingPace | null {
  if (!rangeMillis) return null;
  const [start, end] = rangeMillis;
  const daysInMonth = Math.round((end - start) / 86_400_000);
  if (daysInMonth <= 0) return null;

  let daysElapsed: number;
  let dailyAverage: number;
  let projectedTotal: number;

  const currentExpMinor = toMinorUnits(currentExpenses);

  if (nowMillis >= end) {
    // Past month: entire month elapsed
    daysElapsed = daysInMonth;
    dailyAverage = fromMinorUnits(Math.round(currentExpMinor / daysInMonth));
    projectedTotal = currentExpenses;
  } else if (nowMillis < start) {
    // Future month
    daysElapsed = 0;
    dailyAverage = 0;
    projectedTotal = 0;
  } else {
    // Active current month
    const d = new Date(nowMillis);
    const dayOfMonth = d.getDate();
    daysElapsed = Math.min(Math.max(dayOfMonth, 1), daysInMonth);
    const dailyAverageMinor = Math.round(currentExpMinor / daysElapsed);
    dailyAverage = fromMinorUnits(dailyAverageMinor);
    projectedTotal = fromMinorUnits(dailyAverageMinor * daysInMonth);
  }

  const budget = monthlyBudget && monthlyBudget > 0 ? monthlyBudget : null;
  let projectedOverBudget: number | null = null;
  if (budget !== null) {
    const projectedMinor = toMinorUnits(projectedTotal);
    const budgetMinor = toMinorUnits(budget);
    if (projectedMinor > budgetMinor) {
      projectedOverBudget = fromMinorUnits(projectedMinor - budgetMinor);
    }
  }

  return {
    daysElapsed,
    daysInMonth,
    dailyAverage,
    projectedTotal,
    budget,
    projectedOverBudget,
  };
}

export function computeCategoryMovers(
  currentExpensesMap: Map<string, number>,
  priorExpensesMap: Map<string, number>,
  categories: Category[],
  maxMovers = 3,
): CategoryMover[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const allCategoryIds = new Set([
    ...currentExpensesMap.keys(),
    ...priorExpensesMap.keys(),
  ]);

  const movers: CategoryMover[] = [];

  for (const catId of allCategoryIds) {
    const current = currentExpensesMap.get(catId) ?? 0;
    const prior = priorExpensesMap.get(catId) ?? 0;
    const currentMinor = toMinorUnits(current);
    const priorMinor = toMinorUnits(prior);
    const deltaMinor = currentMinor - priorMinor;
    if (deltaMinor === 0) continue;

    const delta = fromMinorUnits(deltaMinor);
    const percentageDelta =
      priorMinor > 0
        ? Math.round(((currentMinor - priorMinor) / priorMinor) * 1000) / 10
        : null;

    const cat = categoryById.get(catId);
    movers.push({
      categoryId: catId,
      categoryName: cat?.name ?? '?',
      iconName: cat?.iconName ?? 'help',
      colorInt: cat?.colorInt ?? 0xff7eb0e8,
      currentAmount: current,
      priorAmount: prior,
      delta,
      percentageDelta,
    });
  }

  // Largest absolute shift first
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return movers.slice(0, maxMovers);
}

export function computeAllTimeAverages(expenses: Expense[]): AllTimeAverages | null {
  const billable = expenses.filter((e) => !isTransfer(e));
  if (billable.length === 0) return null;

  const months = new Set<number>();
  let totalExpensesMinor = 0;
  let totalIncomeMinor = 0;

  for (const e of billable) {
    months.add(monthBucketStart(e.dateMillis));
    const minor = toMinorUnits(e.amount);
    if (isExpense(e)) totalExpensesMinor += minor;
    else if (isIncome(e)) totalIncomeMinor += minor;
  }

  const monthsCount = Math.max(months.size, 1);
  const avgExp = fromMinorUnits(Math.round(totalExpensesMinor / monthsCount));
  const avgInc = fromMinorUnits(Math.round(totalIncomeMinor / monthsCount));
  const avgNet = fromMinorUnits(
    Math.round((totalIncomeMinor - totalExpensesMinor) / monthsCount),
  );

  return {
    monthsCount,
    averageMonthlyExpenses: avgExp,
    averageMonthlyIncome: avgInc,
    averageMonthlyNet: avgNet,
  };
}

/**
 * Escape a CSV field, neutralizing spreadsheet formula triggers
 * (=, +, -, @, tab, CR) so a malicious note can't execute when the
 * file is opened in Excel/Sheets. Mirrors Android ExportUtils.
 */
export function csvEscapeField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  // \r must quote as well as \n: a lone CR inside a note ends the record for most
  // parsers, so an unquoted one splits a row in half. Browsers normalise textarea
  // newlines to \n, but a note synced from Android can carry a bare CR, and this
  // escaper is the security boundary for the export — Android already checks it.
  if (!/[",\n\r]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function formatCsvAmount(amount: number): string {
  return fromMinorUnits(toMinorUnits(amount)).toFixed(2);
}

/** Same columns and local-time formatting as Android ExportUtils ("yyyy-MM-dd,HH:mm").
 * Date/time are the device's local calendar (no timezone offset column) — deliberate
 * parity with month bucketing in the app (AUS-025). */
export function exportCsv(expenses: Expense[], categories: Category[], unknownLabel: string): string {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const header = 'date,time,type,category,note,amount';
  const pad = (n: number) => String(n).padStart(2, '0');
  const rows = expenses.map((e) => {
    const d = new Date(e.dateMillis);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const cat = catMap.get(e.categoryId)?.name ?? unknownLabel;
    // Two decimals, not String(amount): JS renders 5 as "5" while Kotlin's
    // Double.toString() renders it "5.0", and Kotlin switches to "1.0E9" at scale
    // where JS does not. The same expense therefore exported differently depending
    // on which client produced the file, breaking diffs and re-imports. Amounts are
    // bounded below 1e9 by the rules, so toFixed never reaches exponential form.
    return [date, time, e.transactionType, cat, e.note, formatCsvAmount(e.amount)]
      .map(csvEscapeField)
      .join(',');
  });
  return [header, ...rows].join('\n');
}
