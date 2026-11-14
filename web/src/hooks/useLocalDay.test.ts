import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOfLocalDay, watchLocalDay } from '@/hooks/useLocalDay';
import { analyticsDateRangeMillis, previousPeriodRange } from '@/utils/periodUtils';

function targets() {
  return { visibility: new EventTarget(), focus: new EventTarget() };
}

describe('startOfLocalDay', () => {
  it('returns local midnight of the same day', () => {
    expect(startOfLocalDay(new Date(2026, 10, 14, 23, 59, 59).getTime())).toBe(new Date(2026, 10, 14).getTime());
    expect(startOfLocalDay(new Date(2026, 10, 15, 0, 0, 0).getTime())).toBe(new Date(2026, 10, 15).getTime());
  });
});

describe('watchLocalDay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports the new day once, just after local midnight', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 23, 58));
    const seen: number[] = [];
    const stop = watchLocalDay((d) => seen.push(d), targets());

    vi.advanceTimersByTime(60_000); // 23:59, still the 14th
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(2 * 60_000); // past midnight
    expect(seen).toEqual([new Date(2026, 10, 15).getTime()]);

    // And again the following midnight: the timer re-arms itself.
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(seen).toEqual([new Date(2026, 10, 15).getTime(), new Date(2026, 10, 16).getTime()]);
    stop();
  });

  it('catches up when the page becomes visible after the timer could not run', () => {
    vi.setSystemTime(new Date(2026, 10, 30, 22, 0));
    const t = targets();
    const seen: number[] = [];
    const stop = watchLocalDay((d) => seen.push(d), t);

    // A sleeping laptop: the clock jumps without the timer firing.
    vi.setSystemTime(new Date(2026, 11, 1, 8, 0));
    t.visibility.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([new Date(2026, 11, 1).getTime()]);

    // Regaining focus on the same day reports nothing new.
    t.focus.dispatchEvent(new Event('focus'));
    expect(seen).toHaveLength(1);
    stop();
  });

  it('ignores visibility events while the page is hidden', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 22, 0));
    const t = targets();
    const seen: number[] = [];
    const stop = watchLocalDay((d) => seen.push(d), t, () => false);
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0));
    t.visibility.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([]);
    stop();
  });

  it('stops cleanly', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 23, 59));
    const t = targets();
    const seen: number[] = [];
    watchLocalDay((d) => seen.push(d), t)();
    vi.advanceTimersByTime(10 * 60_000);
    t.focus.dispatchEvent(new Event('focus'));
    expect(seen).toEqual([]);
  });
});

/**
 * What the hook's new value changes downstream: before F-6 these were computed once at
 * mount, so a tab open past midnight kept the old "same days" cut-off and a tab open into
 * a new month kept showing the old month as "this month".
 */
describe('ranges derived from the local day', () => {
  it('moves the "same days last month" cut-off forward with the date', () => {
    const nov14 = new Date(2026, 10, 14).getTime();
    const nov15 = new Date(2026, 10, 15).getTime();
    expect(previousPeriodRange('month:2026-11', nov14)?.rangeMillis[1]).toBe(new Date(2026, 9, 15).getTime());
    expect(previousPeriodRange('month:2026-11', nov15)?.rangeMillis[1]).toBe(new Date(2026, 9, 16).getTime());
  });

  it('moves "this month" into the new month', () => {
    expect(analyticsDateRangeMillis('this_month', new Date(2026, 10, 30).getTime())?.[0]).toBe(new Date(2026, 10, 1).getTime());
    expect(analyticsDateRangeMillis('this_month', new Date(2026, 11, 1).getTime())?.[0]).toBe(new Date(2026, 11, 1).getTime());
  });

  it('keeps a past month identical across days, so its listener is not re-subscribed', () => {
    const a = JSON.stringify(analyticsDateRangeMillis('month:2026-09', new Date(2026, 10, 14).getTime()));
    const b = JSON.stringify(analyticsDateRangeMillis('month:2026-09', new Date(2026, 10, 15).getTime()));
    expect(a).toBe(b);
    const pa = JSON.stringify(previousPeriodRange('month:2026-09', new Date(2026, 10, 14).getTime()));
    const pb = JSON.stringify(previousPeriodRange('month:2026-09', new Date(2026, 10, 15).getTime()));
    expect(pa).toBe(pb);
  });
});
