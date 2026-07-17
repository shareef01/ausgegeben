import type { Expense, Category, CashFlowPoint } from '@/models/types';
import { dayKey } from '@/utils/periodUtils';

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

export function computeCashFlowTrend(expenses: Expense[], bucketCount = 7): CashFlowPoint[] {
  if (expenses.length === 0) return [];
  const sorted = [...expenses].sort((a, b) => a.dateMillis - b.dateMillis);
  const start = sorted[0].dateMillis;
  const end = sorted[sorted.length - 1].dateMillis;
  const span = Math.max(end - start, 1);
  const bucketSize = span / bucketCount;

  const buckets: CashFlowPoint[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = start + bucketSize * i;
    const bucketEnd = bucketStart + bucketSize;
    let income = 0;
    let expense = 0;
    for (const e of sorted) {
      if (e.dateMillis >= bucketStart && e.dateMillis < bucketEnd) {
        if (isIncome(e)) income += e.amount;
        if (isExpense(e)) expense += e.amount;
      }
    }
    buckets.push({
      label: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(bucketStart)),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
    });
  }
  return buckets;
}

export function exportCsv(expenses: Expense[], categories: Category[]): string {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const header = 'date,time,type,category,vendor,amount';
  const rows = expenses.map((e) => {
    const d = new Date(e.dateMillis);
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 8);
    const cat = catMap.get(e.categoryId)?.name ?? 'Unknown';
    return `${date},${time},${e.transactionType},${cat},"${e.note.replace(/"/g, '""')}",${e.amount}`;
  });
  return [header, ...rows].join('\n');
}
