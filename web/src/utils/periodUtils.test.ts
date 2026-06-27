import { describe, expect, it } from 'vitest';
import {
  analyticsDateRangeMillis,
  analyticsPeriodOptions,
  dayKey,
  formatRelativeTimestamp,
  thisMonthRange,
} from '@/utils/periodUtils';

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

  it('dayKey is stable for same calendar day', () => {
    const morning = new Date(2026, 5, 10, 8).getTime();
    const evening = new Date(2026, 5, 10, 20).getTime();
    expect(dayKey(morning)).toBe(dayKey(evening));
  });

  it('formatRelativeTimestamp labels today', () => {
    const now = new Date(2026, 5, 10, 15, 30).getTime();
    const earlier = new Date(2026, 5, 10, 9, 0).getTime();
    expect(formatRelativeTimestamp(earlier, 'en', now)).toMatch(/^Today,/);
  });
});
