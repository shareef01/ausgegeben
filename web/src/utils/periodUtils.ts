import type { AnalyticsPeriodOption, Expense, SpendingInsights } from '@/models/types';
import type { Locale } from '@/i18n';
import { localeTag, t } from '@/i18n';
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

export function localDayStartMillis(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function thisMonthRange(now = Date.now()): [number, number] {
  const d = new Date(now);
  return monthRange(d.getFullYear(), d.getMonth());
}

export function analyticsPeriodOptions(monthsBack = 24, now = Date.now()): AnalyticsPeriodOption[] {
  const cal = new Date(now);
  cal.setDate(1);
  cal.setHours(0, 0, 0, 0);
  const thisMonth = thisMonthRange(now);
  const options: AnalyticsPeriodOption[] = [
    { label: t('periodAllTime'), storageKey: 'all_time', rangeMillis: null },
    { label: monthTitle(thisMonth[0]), storageKey: 'this_month', rangeMillis: thisMonth },
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

export function analyticsPeriodOptionFromStorage(storageKey: string, now = Date.now()): AnalyticsPeriodOption {
  const known = analyticsPeriodOptions(24, now).find((option) => option.storageKey === storageKey);
  if (known) return known;

  const range = analyticsDateRangeMillis(storageKey, now);
  if (range) {
    return { label: monthTitle(range[0]), storageKey, rangeMillis: range };
  }

  return { label: t('periodAllTime'), storageKey: 'all_time', rangeMillis: null };
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

export function recentWeekRangeMillis(now = Date.now()): [number, number] {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return [start.getTime(), now + 1];
}

export function computeSpendingInsights(
  monthExpenses: Expense[],
  weekExpenses: Expense[],
  categoryNames: Map<number, string>,
): SpendingInsights {
  const billableMonth = monthExpenses.filter((e) => e.transactionType !== 'transfer');
  const topCategory = [...billableMonth]
    .filter((e) => e.transactionType === 'expense')
    .reduce((map, expense) => {
      map.set(expense.categoryId, (map.get(expense.categoryId) ?? 0) + expense.amount);
      return map;
    }, new Map<number, number>());

  let topId: number | undefined;
  let topAmount = 0;
  for (const [id, amount] of topCategory) {
    if (amount > topAmount) {
      topId = id;
      topAmount = amount;
    }
  }

  const weekLoggedDays = new Set(
    weekExpenses.map((e) => localDayStartMillis(e.dateMillis)),
  ).size;

  return {
    topCategoryName: topId != null ? categoryNames.get(topId) : undefined,
    topCategoryAmount: topAmount > 0 ? topAmount : undefined,
    weekTotal: weekLoggedDays,
  };
}

export function computeDayTotals(
  expenses: Expense[],
  locale?: Locale,
): Record<string, { income: number; expense: number }> {
  const totals = new Map<string, { income: number; expense: number }>();

  for (const expense of expenses) {
    if (expense.transactionType === 'transfer') continue;
    const label = formatDateLabel(expense.dateMillis, locale);
    const current = totals.get(label) ?? { income: 0, expense: 0 };
    if (expense.transactionType === 'income') {
      totals.set(label, { income: current.income + expense.amount, expense: current.expense });
    } else {
      totals.set(label, { income: current.income, expense: current.expense + expense.amount });
    }
  }

  return Object.fromEntries(totals);
}

/** `YYYY-MM-DD` for `<input type="date">` in local timezone. */
export function toDateInputValue(millis: number): string {
  const d = new Date(millis);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Apply a picked local calendar date while preserving time-of-day. */
export function applyLocalDateToMillis(existingMillis: number, dateInput: string): number {
  const [year, month, day] = dateInput.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return existingMillis;
  const next = new Date(existingMillis);
  next.setFullYear(year, month - 1, day);
  return next.getTime();
}

export function formatCalendarDate(millis: number, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(millis));
}
