import type { AnalyticsPeriodOption } from '@/models/types';
import { localeTag, t, type Locale } from '@/i18n';
import { usePreferencesStore } from '@/services/preferencesStore';

function monthRange(year: number, month: number): [number, number] {
  const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0).getTime();
  return [start, end];
}

function resolveLocale(locale?: Locale): string {
  const loc = locale ?? usePreferencesStore.getState().locale;
  return localeTag(loc);
}

function monthTitle(millis: number, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), { month: 'long', year: 'numeric' }).format(new Date(millis));
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
  const options: AnalyticsPeriodOption[] = [
    { label: t('periodAllTime'), storageKey: 'all_time', rangeMillis: null },
  ];

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

export function formatDateLabel(millis: number, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(millis));
}

export function formatTime(millis: number, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(new Date(millis));
}

export function dayKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** e.g. "Today, 14:32" · "Yesterday, 09:15" · "Mon, 14:32" */
export function formatRelativeTimestamp(millis: number, locale?: Locale, now = Date.now()): string {
  const time = formatTime(millis, locale);
  const day = dayKey(millis);
  const today = dayKey(now);
  if (day === today) return `${t('timeToday')}, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === dayKey(yesterday.getTime())) return `${t('timeYesterday')}, ${time}`;

  const weekAgo = now - 7 * 86_400_000;
  if (millis >= weekAgo) {
    const weekday = new Intl.DateTimeFormat(resolveLocale(locale), { weekday: 'short' }).format(new Date(millis));
    return `${weekday}, ${time}`;
  }

  return `${formatDateLabel(millis, locale)}, ${time}`;
}
