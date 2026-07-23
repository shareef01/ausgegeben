import type { Expense, Category, CashFlowPoint } from '@/models/types';
import { analyticsDateRangeMillis, dayKey } from '@/utils/periodUtils';
import { getLocale, localeTag } from '@/i18n';

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
  let totalExpenses = 0;
  let totalIncome = 0;
  let totalTransfers = 0;
  for (const e of expenses) {
    if (isExpense(e)) totalExpenses += e.amount;
    else if (isIncome(e)) totalIncome += e.amount;
    else totalTransfers += e.amount;
  }
  return {
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalTransfers: Math.round(totalTransfers * 100) / 100,
    net: Math.round((totalIncome - totalExpenses) * 100) / 100
  };
}

export function groupByCategory(expenses: Expense[], type: Expense['transactionType']): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.transactionType !== type) continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
  }
  for (const [key, value] of map) {
    map.set(key, Math.round(value * 100) / 100);
  }
  return map;
}

export function computeDayTotals(expenses: Expense[]): Record<string, { income: number; expense: number }> {
  const result: Record<string, { income: number; expense: number }> = {};
  for (const e of expenses) {
    const label = dayKey(e.dateMillis);
    if (!result[label]) result[label] = { income: 0, expense: 0 };
    if (isIncome(e)) result[label].income += e.amount;
    if (isExpense(e)) result[label].expense += e.amount;
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
    if (isIncome(e)) entry.income += e.amount;
    if (isExpense(e)) entry.expense += e.amount;
    byBucket.set(key, entry);
  }

  return buckets.map(({ start, label }) => {
    const entry = byBucket.get(start);
    return {
      label,
      income: Math.round((entry?.income ?? 0) * 100) / 100,
      expense: Math.round((entry?.expense ?? 0) * 100) / 100,
    };
  });
}

/**
 * Escape a CSV field, neutralizing spreadsheet formula triggers
 * (=, +, -, @, tab, CR) so a malicious note can't execute when the
 * file is opened in Excel/Sheets. Mirrors Android ExportUtils.
 */
export function csvEscapeField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Same columns and local-time formatting as Android ExportUtils ("yyyy-MM-dd,HH:mm"). */
export function exportCsv(expenses: Expense[], categories: Category[]): string {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const header = 'date,time,type,category,note,amount';
  const pad = (n: number) => String(n).padStart(2, '0');
  const rows = expenses.map((e) => {
    const d = new Date(e.dateMillis);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const cat = catMap.get(e.categoryId)?.name ?? 'Unknown';
    return [date, time, e.transactionType, cat, e.note, String(e.amount)]
      .map(csvEscapeField)
      .join(',');
  });
  return [header, ...rows].join('\n');
}
