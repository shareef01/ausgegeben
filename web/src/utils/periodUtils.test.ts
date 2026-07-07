import { describe, expect, it } from 'vitest';
import {
  analyticsDateRangeMillis,
  analyticsPeriodOptionFromStorage,
  analyticsPeriodOptions,
  computeDayTotals,
  computeSpendingInsights,
  dayKey,
  formatRelativeTimestamp,
  localDayStartMillis,
  recentWeekRangeMillis,
  thisMonthRange,
} from '@/utils/periodUtils';
import type { Expense } from '@/models/types';

const JUNE_2026 = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

describe('periodUtils', () => {
  it('thisMonthRange uses inclusive start and exclusive end', () => {
    const [start, end] = thisMonthRange(JUNE_2026);
    expect(new Date(start).getMonth()).toBe(5);
    expect(new Date(end).getMonth()).toBe(6);
    expect(JUNE_2026).toBeGreaterThanOrEqual(start);
    expect(JUNE_2026).toBeLessThan(end);
  });

  it('analyticsPeriodOptions puts all_time first', () => {
    const options = analyticsPeriodOptions(3, JUNE_2026);
    expect(options[0]?.storageKey).toBe('all_time');
    expect(options[1]?.storageKey).toBe('this_month');
    expect(options[0]?.rangeMillis).toBeNull();
    expect(options).toHaveLength(5);
  });

  it('analyticsPeriodOptionFromStorage resolves month keys outside the rolling window', () => {
    const option = analyticsPeriodOptionFromStorage('month:2024-01', JUNE_2026);
    expect(option.storageKey).toBe('month:2024-01');
    expect(option.label).toMatch(/january 2024/i);
  });

  it('analyticsDateRangeMillis returns null for all_time', () => {
    expect(analyticsDateRangeMillis('all_time', JUNE_2026)).toBeNull();
  });

  it('analyticsDateRangeMillis parses month storage keys', () => {
    const range = analyticsDateRangeMillis('month:2026-06', JUNE_2026);
    expect(range).not.toBeNull();
    expect(new Date(range![0]).getMonth()).toBe(5);
  });

  it('analyticsDateRangeMillis falls back for malformed month keys', () => {
    const range = analyticsDateRangeMillis('month:bad', JUNE_2026);
    expect(range).toEqual(thisMonthRange(JUNE_2026));
  });

  it('dayKey is stable for same calendar day', () => {
    const morning = new Date(2026, 5, 10, 8).getTime();
    const evening = new Date(2026, 5, 10, 20).getTime();
    expect(dayKey(morning)).toBe(dayKey(evening));
  });

  it('localDayStartMillis aligns to local midnight', () => {
    const afternoon = new Date(2026, 5, 10, 15, 30).getTime();
    const start = localDayStartMillis(afternoon);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getMinutes()).toBe(0);
    expect(afternoon).toBeGreaterThanOrEqual(start);
  });

  it('formatRelativeTimestamp labels today', () => {
    const now = new Date(2026, 5, 10, 15, 30).getTime();
    const earlier = new Date(2026, 5, 10, 9, 0).getTime();
    expect(formatRelativeTimestamp(earlier, 'en', now)).toMatch(/^today,/i);
  });

  it('computeDayTotals sums income and expense per label', () => {
    const expenses: Expense[] = [
      { id: 1, cloudId: 'a', amount: 10, dateMillis: JUNE_2026, categoryId: 1, note: '', transactionType: 'income' },
      { id: 2, cloudId: 'b', amount: 4, dateMillis: JUNE_2026, categoryId: 1, note: '', transactionType: 'expense' },
      { id: 3, cloudId: 'c', amount: 99, dateMillis: JUNE_2026, categoryId: 1, note: '', transactionType: 'transfer' },
    ];
    const totals = computeDayTotals(expenses, 'en');
    const labels = Object.keys(totals);
    expect(labels).toHaveLength(1);
    expect(totals[labels[0]]).toEqual({ income: 10, expense: 4 });
  });

  it('computeSpendingInsights finds top expense category in month', () => {
    const month: Expense[] = [
      { id: 1, cloudId: 'a', amount: 20, dateMillis: JUNE_2026, categoryId: 1, note: '', transactionType: 'expense' },
      { id: 2, cloudId: 'b', amount: 5, dateMillis: JUNE_2026, categoryId: 2, note: '', transactionType: 'expense' },
    ];
    const insights = computeSpendingInsights(month, [], new Map([[1, 'Food'], [2, 'Travel']]));
    expect(insights.topCategoryName).toBe('Food');
    expect(insights.topCategoryAmount).toBe(20);
  });

  it('recentWeekRangeMillis spans seven days', () => {
    const [start, end] = recentWeekRangeMillis(JUNE_2026);
    expect(end).toBeGreaterThan(start);
    expect(JUNE_2026 - start).toBeLessThanOrEqual(7 * 86_400_000);
  });
});
