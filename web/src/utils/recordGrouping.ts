import type { Expense, TransactionSortOrder } from '@/models/types';
import type { Locale } from '@/i18n';
import { dayKey, formatDateLabel } from './periodUtils';
import { startOfTomorrowMillis } from './analytics';

/**
 * One rendered section of the record list: a calendar day, or a single row when the list is
 * sorted by amount.
 */
export interface RecordRowGroup {
  key: string;
  label: string;
  items: Expense[];
  /** Income and expense of the rows in *this* group, in currency units rounded to cents. */
  dayIncome: number;
  dayExpense: number;
  /**
   * U-5: the group is dated after today (people log rent before it is due). Sorted by date,
   * such rows sit at the top of the list looking like the latest spending; the header marks
   * them upcoming. Insights already leaves them out of "spent so far" (F-1).
   */
  upcoming: boolean;
}

/**
 * Groups the rows the list is actually showing (UX-3).
 *
 * Two rules matter here and both are asserted in `recordDayTotals.test.ts`:
 *
 *  - **Totals follow the rows.** `dayTotalsByLabel` is computed by the view model from the same
 *    filtered list that produced `expenses`, so a day header always adds up the rows beneath it.
 *    It used to come from the unfiltered period, which made the header disagree with the list.
 *  - **Amount sorting has no day totals.** When sorting by amount the rows are no longer grouped
 *    by day, so each row becomes its own section keyed by row id; no such key can appear in
 *    `dayTotalsByLabel` (which is keyed by calendar day), so those sections show no total at all
 *    rather than a number that would imply a day.
 */
export function groupRecordRows(params: {
  expenses: Expense[];
  sortOrder: TransactionSortOrder;
  dayTotalsByLabel: Record<string, [number, number]>;
  locale?: Locale;
  /** Start of the current local day; rows from the next day on are marked upcoming. */
  todayMillis?: number;
}): RecordRowGroup[] {
  const { expenses, sortOrder, dayTotalsByLabel, locale, todayMillis } = params;
  const upcomingFrom = todayMillis == null ? Number.POSITIVE_INFINITY : startOfTomorrowMillis(todayMillis);
  const map = new Map<string, Expense[]>();
  const byAmount = sortOrder.startsWith('amount');
  for (const expense of expenses) {
    const key = byAmount ? expense.id : dayKey(expense.dateMillis);
    const bucket = map.get(key);
    if (bucket) bucket.push(expense);
    else map.set(key, [expense]);
  }
  return [...map.entries()].map(([key, items]) => {
    const [dayIncome, dayExpense] = dayTotalsByLabel[key] ?? [0, 0];
    return {
      key,
      label: formatDateLabel(items[0].dateMillis, locale),
      items,
      dayIncome,
      dayExpense,
      upcoming: items[0].dateMillis >= upcomingFrom,
    };
  });
}
