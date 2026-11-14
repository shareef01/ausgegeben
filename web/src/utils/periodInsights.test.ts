import { describe, expect, it } from 'vitest';
import type { Category, Expense } from '@/models/types';
import {
  computePeriodInsights,
  computeSpendingPace,
  splitScheduled,
  startOfTomorrowMillis,
} from '@/utils/analytics';

const categories: Category[] = [
  { id: 'dining', name: 'Dining', iconName: 'restaurant', colorInt: 0xff112233, transactionType: 'expense', sortOrder: 0, updatedAt: 0 },
  { id: 'rent', name: 'Rent', iconName: 'home', colorInt: 0xff445566, transactionType: 'expense', sortOrder: 1, updatedAt: 0 },
];

let seq = 0;
function row(amount: number, date: Date, categoryId = 'dining', transactionType: Expense['transactionType'] = 'expense'): Expense {
  seq += 1;
  return { id: `e${seq}`, amount, dateMillis: date.getTime(), categoryId, note: '', transactionType, updatedAt: 0 } as Expense;
}

// November 2026 is in progress on the 14th, mid-afternoon.
const NOV: [number, number] = [new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime()];
const NOW = new Date(2026, 10, 14, 15, 30).getTime();

describe('startOfTomorrowMillis / splitScheduled', () => {
  it('cuts at local midnight after today, so anything dated today has happened', () => {
    const cutoff = startOfTomorrowMillis(NOW);
    expect(cutoff).toBe(new Date(2026, 10, 15).getTime());
    const lateToday = row(5, new Date(2026, 10, 14, 23, 59));
    const tomorrow = row(7, new Date(2026, 10, 15, 0, 0));
    const { toDate, scheduled } = splitScheduled([lateToday, tomorrow], cutoff);
    expect(toDate).toEqual([lateToday]);
    expect(scheduled).toEqual([tomorrow]);
  });
});

describe('computeSpendingPace with scheduled spending', () => {
  it('adds scheduled spending once instead of extrapolating it', () => {
    // 140 over 14 days → 10/day → 300 for 30 days, plus a 1,000 bill due on the 28th.
    const pace = computeSpendingPace(140, NOV, NOW, 2000, 1000);
    expect(pace?.dailyAverage).toBe(10);
    expect(pace?.projectedTotal).toBe(1300);
    expect(pace?.projectedOverBudget).toBeNull();
  });

  it('ignores scheduled spending for a finished month', () => {
    const later = new Date(2026, 11, 5).getTime();
    expect(computeSpendingPace(500, NOV, later, null, 999)?.projectedTotal).toBe(500);
  });
});

describe('computePeriodInsights', () => {
  const priorCut = [row(100, new Date(2026, 9, 3)), row(40, new Date(2026, 9, 10))]; // 1–14 Oct

  it('does not treat a bill dated later this month as already spent (F-1)', () => {
    const current = [
      row(70, new Date(2026, 10, 2)),
      row(70, new Date(2026, 10, 12)),
      row(1069.5, new Date(2026, 10, 28), 'rent'), // logged early, due on the 28th
    ];
    const { pace, comparison } = computePeriodInsights(current, priorCut, categories, NOV, 2000, NOW);

    // Before the fix: 1,209.50 / 14 × 30 = 2,591.79, "over budget".
    expect(pace?.dailyAverage).toBe(10);
    expect(pace?.projectedTotal).toBe(1369.5);
    expect(pace?.projectedOverBudget).toBeNull();

    // 1–14 Nov (140) vs 1–14 Oct (140): no change, not +1,069.50.
    expect(comparison.expenseDelta).toBe(0);
  });

  it('keeps scheduled rows out of the category movers', () => {
    const current = [row(140, new Date(2026, 10, 5)), row(900, new Date(2026, 10, 28), 'rent')];
    const { categoryMovers } = computePeriodInsights(current, priorCut, categories, NOV, null, NOW);
    expect(categoryMovers.map((m) => m.categoryId)).not.toContain('rent');
  });

  it('shows no movers when the prior period has no data (F-2)', () => {
    const current = [row(154.5, new Date(2026, 10, 12))];
    const { comparison, categoryMovers } = computePeriodInsights(current, [], categories, NOV, null, NOW);
    expect(comparison.hasPriorData).toBe(false);
    expect(categoryMovers).toEqual([]);
  });

  it('shows no movers when the prior period holds only transfers', () => {
    const current = [row(154.5, new Date(2026, 10, 12))];
    const prior = [row(50, new Date(2026, 9, 2), 'dining', 'transfer')];
    expect(computePeriodInsights(current, prior, categories, NOV, null, NOW).categoryMovers).toEqual([]);
  });

  it('uses every row of a finished month', () => {
    const later = new Date(2026, 11, 5).getTime();
    const current = [row(100, new Date(2026, 10, 2)), row(900, new Date(2026, 10, 28), 'rent')];
    const prior = [row(1000, new Date(2026, 9, 2))];
    const { comparison, pace, categoryMovers } = computePeriodInsights(current, prior, categories, NOV, null, later);
    expect(comparison.expenseDelta).toBe(0);
    expect(pace?.projectedTotal).toBe(1000);
    expect(categoryMovers.map((m) => m.categoryId)).toContain('rent');
  });
});
