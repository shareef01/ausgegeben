import type { AnalyticsPeriodOption } from '@/models/types';

function monthRange(year: number, month: number): [number, number] {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime();
  return [start, end];
}

function monthTitle(millis: number, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(millis));
}

function monthStorageKey(year: number, month: number): string {
  return `month:${year}-${String(month + 1).padStart(2, '0')}`;
}

export function thisMonthRange(now = Date.now()): [number, number] {
  const d = new Date(now);
  return monthRange(d.getFullYear(), d.getMonth());
}

export function analyticsPeriodOptions(monthsBack = 14, now = Date.now()): AnalyticsPeriodOption[] {
  const cal = new Date(now);
  cal.setDate(1);
  cal.setHours(0, 0, 0, 0);
  const options: AnalyticsPeriodOption[] = [];

  for (let i = 0; i < monthsBack; i++) {
    const year = cal.getFullYear();
    const month = cal.getMonth();
    const range = monthRange(year, month);
    options.push({
      label: monthTitle(range[0]),
      storageKey: monthStorageKey(year, month),
      rangeMillis: range,
    });
    cal.setMonth(cal.getMonth() - 1);
  }

  options.push({ label: 'All time', storageKey: 'all_time', rangeMillis: null });
  return options;
}

export function analyticsDateRangeMillis(storageKey: string, now = Date.now()): [number, number] | null {
  if (storageKey === 'all_time') return null;
  if (storageKey === 'this_month') return thisMonthRange(now);
  if (storageKey.startsWith('month:')) {
    const [, ym] = storageKey.split('month:');
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return thisMonthRange(now);
    return monthRange(y, m - 1);
  }
  return thisMonthRange(now);
}

export function formatDateLabel(millis: number, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(millis));
}

export function formatTime(millis: number, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(millis));
}

export function dayKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
