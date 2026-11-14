import type { Category, TransactionType } from '@/models/types';
import { selectableCategoriesFor } from '@/viewmodels/useAddTransactionViewModel';
import type { TranslationKey } from '@/i18n';
import type { Locale } from '@/i18n';
import { formatAmountForInput, parseAmount } from '@/utils/currency';
import { localDateAt, occurrenceDate, validTemplate, type Frequency, type RecurringTemplate } from '@/services/recurrence';

/**
 * What the recurring editor shows. Text fields stay text while the person types (an amount
 * of "12," is a valid moment, not an error), and are turned back into a template on save.
 * The template itself, and how it recurs, is unchanged: this only replaces the old form.
 */
export interface RecurringForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string;
  note: string;
  intervalInput: string;
  frequency: Frequency;
  startDate: string;
  /** '' means "no end date". */
  endDate: string;
}

export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

/** A fresh template starting today, in the device's time zone (fixed for its lifetime). */
export function newTemplate(now: number, timeZone: string, categoryId: string): RecurringTemplate {
  const startDate = localDateAt(now, timeZone);
  return {
    id: crypto.randomUUID(),
    amount: 0,
    categoryId,
    note: '',
    transactionType: 'expense',
    frequency: 'monthly',
    interval: 1,
    startDate,
    endDate: null,
    timeZone,
    enabled: true,
    nextIndex: 0,
    nextDate: startDate,
    createdAt: now,
    updatedAt: now,
  };
}

/** A new template opens with an empty amount (the placeholder shows 0.00), never a made-up 1. */
export function formFromTemplate(template: RecurringTemplate, locale: Locale, isNew: boolean): RecurringForm {
  return {
    amountInput: isNew ? '' : formatAmountForInput(template.amount, locale),
    transactionType: template.transactionType,
    categoryId: template.categoryId,
    note: template.note,
    intervalInput: String(template.interval),
    frequency: template.frequency,
    startDate: template.startDate,
    endDate: template.endDate ?? '',
  };
}

/** Whether closing would lose something the person typed. Equivalent amounts ("12,5" vs "12,50") are unchanged. */
export function isRecurringFormDirty(baseline: RecurringForm, form: RecurringForm, locale: Locale): boolean {
  const amount = (input: string) => (input.trim() === '' ? '' : parseAmount(input, locale) ?? input.trim());
  return amount(baseline.amountInput) !== amount(form.amountInput)
    || baseline.transactionType !== form.transactionType
    || baseline.categoryId !== form.categoryId
    || baseline.note.trim() !== form.note.trim()
    || baseline.intervalInput.trim() !== form.intervalInput.trim()
    || baseline.frequency !== form.frequency
    || baseline.startDate !== form.startDate
    || baseline.endDate !== form.endDate;
}

export type RecurringFormError = 'amount' | 'category' | 'interval' | 'end' | 'invalid';

export const FORM_ERROR_KEYS: Record<RecurringFormError, TranslationKey> = {
  amount: 'errorValidAmount',
  category: 'errorChooseCategory',
  interval: 'recurringIntervalError',
  end: 'recurringEndError',
  invalid: 'recurringInvalid',
};

/**
 * Builds the template to save from the form, or names the first field that is wrong.
 * `nextIndex` is kept and `nextDate` recomputed exactly as before; the repository still
 * decides the real next occurrence when it saves an edit.
 */
export function templateFromForm(
  base: RecurringTemplate,
  form: RecurringForm,
  locale: Locale,
): { ok: true; template: RecurringTemplate } | { ok: false; error: RecurringFormError } {
  const amount = parseAmount(form.amountInput, locale);
  if (amount == null || !(amount > 0) || amount >= 1e9) return { ok: false, error: 'amount' };
  if (!form.categoryId) return { ok: false, error: 'category' };
  const intervalText = form.intervalInput.trim();
  const interval = /^\d+$/.test(intervalText) ? Number(intervalText) : NaN;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return { ok: false, error: 'interval' };
  if (form.endDate && form.endDate < form.startDate) return { ok: false, error: 'end' };
  const draft: RecurringTemplate = {
    ...base,
    amount,
    transactionType: form.transactionType,
    categoryId: form.categoryId,
    note: form.note.trim(),
    interval,
    frequency: form.frequency,
    startDate: form.startDate,
    endDate: form.endDate || null,
  };
  const template = { ...draft, nextDate: occurrenceDate(draft, draft.nextIndex) };
  if (!validTemplate(template)) return { ok: false, error: 'invalid' };
  return { ok: true, template };
}

const EVERY_ONE: Record<Frequency, TranslationKey> = {
  daily: 'recurringEveryDay',
  weekly: 'recurringEveryWeek',
  monthly: 'recurringEveryMonth',
  yearly: 'recurringEveryYear',
};

export const UNIT_KEYS: Record<Frequency, TranslationKey> = {
  daily: 'recurringDaily',
  weekly: 'recurringWeekly',
  monthly: 'recurringMonthly',
  yearly: 'recurringYearly',
};

/** "every month", "every 2 weeks" — the schedule in words. */
export function scheduleText(
  frequency: Frequency,
  interval: number,
  t: (key: TranslationKey, params?: Record<string, string>) => string,
): string {
  if (interval === 1) return t(EVERY_ONE[frequency]);
  return t('recurringEveryN', { count: String(interval), unit: t(UNIT_KEYS[frequency]) });
}

/** "7 Dec" (this year) or "7 Dec 2027" for an ISO date, without shifting it across time zones. */
export function formatDueDate(isoDate: string, localeTag: string, today = new Date()): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const sameYear = date.getUTCFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

/** Categories a recurring template may use: the add dialog's picker, minus ones mid-migration. */
export function recurringCategoriesFor(categories: Category[], type: TransactionType): Category[] {
  return selectableCategoriesFor(categories, type).filter((c) => !c.migrationState);
}
