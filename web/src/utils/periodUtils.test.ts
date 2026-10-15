import { describe, expect, it } from 'vitest';
import {
  analyticsDateRangeMillis,
  analyticsPeriodOptions,
  dayKey,
  formatRelativeTimestamp,
  isInThisMonth,
  normalizeAnalyticsPeriodKey,
  previousPeriodRange,
  thisMonthRange,
  toDateInputValue,
  withDateInputValue,
} from '@/utils/periodUtils';

const JUNE_2026 = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

describe('periodUtils', () => {
  it('withDateInputValue moves the day but keeps the time of day', () => {
    const original = new Date(2026, 4, 10, 7, 45, 30, 250).getTime();
    expect(withDateInputValue('2026-05-03', original)).toBe(new Date(2026, 4, 3, 7, 45, 30, 250).getTime());
    expect(toDateInputValue(withDateInputValue('2026-12-31', original))).toBe('2026-12-31');
  });

  it('formatRelativeTimestamp labels yesterday by calendar day across DST', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      // 2026-03-29 is 23h long in Berlin, so now - 24h early on 03-30 is 03-28.
      const now = new Date(2026, 2, 30, 0, 30).getTime();
      const label = formatRelativeTimestamp(new Date(2026, 2, 29, 12, 0).getTime(), 'en', now);
      expect(label).toMatch(/^yesterday,/i);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('isInThisMonth keeps budget projections to the current local month', () => {
    const [start, end] = thisMonthRange(JUNE_2026);
    expect(isInThisMonth(JUNE_2026, JUNE_2026)).toBe(true);
    expect(isInThisMonth(start, JUNE_2026)).toBe(true);
    expect(isInThisMonth(end - 1, JUNE_2026)).toBe(true);
    // A backdated or forward-dated entry never counts against this month's budget.
    expect(isInThisMonth(start - 1, JUNE_2026)).toBe(false);
    expect(isInThisMonth(end, JUNE_2026)).toBe(false);
    expect(isInThisMonth(new Date(2026, 4, 20).getTime(), JUNE_2026)).toBe(false);
  });

  it('thisMonthRange uses inclusive start and exclusive end', () => {
    const [start, end] = thisMonthRange(JUNE_2026);
    expect(new Date(start).getMonth()).toBe(5);
    expect(new Date(end).getMonth()).toBe(6);
    expect(JUNE_2026).toBeGreaterThanOrEqual(start);
    expect(JUNE_2026).toBeLessThan(end);
  });

  it('analyticsPeriodOptions default depth is 14 months plus all_time', () => {
    const options = analyticsPeriodOptions(undefined, JUNE_2026);
    expect(options).toHaveLength(15);
    expect(options[0]?.storageKey).toBe('all_time');
    expect(options[1]?.storageKey).toBe('month:2026-06');
    expect(options.at(-1)?.storageKey).toBe('month:2025-05');
  });

  it('analyticsPeriodOptions puts all_time first', () => {
    const options = analyticsPeriodOptions(3, JUNE_2026);
    expect(options[0]?.storageKey).toBe('all_time');
    expect(options[0]?.rangeMillis).toBeNull();
    expect(options).toHaveLength(4);
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

  it('normalizeAnalyticsPeriodKey maps legacy keys to month keys', () => {
    expect(normalizeAnalyticsPeriodKey('this_month', JUNE_2026)).toBe('month:2026-06');
    expect(normalizeAnalyticsPeriodKey('last_month', JUNE_2026)).toBe('month:2026-05');
    expect(normalizeAnalyticsPeriodKey('all_time', JUNE_2026)).toBe('all_time');
    expect(normalizeAnalyticsPeriodKey('month:2026-02', JUNE_2026)).toBe('month:2026-02');
  });

  it('dayKey is stable for same calendar day', () => {
    const morning = new Date(2026, 5, 10, 8).getTime();
    const evening = new Date(2026, 5, 10, 20).getTime();
    expect(dayKey(morning)).toBe(dayKey(evening));
  });

  it('formatRelativeTimestamp labels today', () => {
    const now = new Date(2026, 5, 10, 15, 30).getTime();
    const earlier = new Date(2026, 5, 10, 9, 0).getTime();
    expect(formatRelativeTimestamp(earlier, 'en', now)).toMatch(/^today,/);
  });

  it('previousPeriodRange handles month keys and year rollover', () => {
    const priorJune = previousPeriodRange('month:2026-06', JUNE_2026);
    expect(priorJune).not.toBeNull();
    expect(priorJune?.storageKey).toBe('month:2026-05');
    expect(new Date(priorJune!.rangeMillis[0]).getMonth()).toBe(4);

    const priorJan = previousPeriodRange('month:2026-01', JUNE_2026);
    expect(priorJan).not.toBeNull();
    expect(priorJan?.storageKey).toBe('month:2025-12');
    expect(new Date(priorJan!.rangeMillis[0]).getFullYear()).toBe(2025);
    expect(new Date(priorJan!.rangeMillis[0]).getMonth()).toBe(11);

    expect(previousPeriodRange('all_time', JUNE_2026)).toBeNull();
    expect(previousPeriodRange('this_month', JUNE_2026)?.storageKey).toBe('month:2026-05');
  });
});
