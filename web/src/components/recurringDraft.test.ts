import { describe, expect, it } from 'vitest';
import {
  formFromTemplate,
  formatDueDate,
  isRecurringFormDirty,
  newTemplate,
  scheduleText,
  templateFromForm,
  type RecurringForm,
} from '@/components/recurringDraft';
import type { RecurringTemplate } from '@/services/recurrence';
import { en } from '@/i18n/en';

const now = Date.UTC(2026, 10, 7, 10, 0, 0);
const base = (): RecurringTemplate => ({ ...newTemplate(now, 'Europe/Berlin', 'cat-rent'), id: '0b3a1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' });
const tr = (key: keyof typeof en, params?: Record<string, string>) =>
  Object.entries(params ?? {}).reduce<string>((text, [k, v]) => text.replace(`{${k}}`, v), en[key]);

describe('recurring editor form', () => {
  it('opens a new template with an empty amount, starting today', () => {
    const form = formFromTemplate(base(), 'de', true);
    expect(form.amountInput).toBe('');
    expect(form.startDate).toBe('2026-11-07');
    expect(form.endDate).toBe('');
    expect(form.intervalInput).toBe('1');
  });

  it('shows an existing amount in the currency format', () => {
    expect(formFromTemplate({ ...base(), amount: 12.5 }, 'de', false).amountInput).toBe('12,50');
    expect(formFromTemplate({ ...base(), amount: 12.5 }, 'en', false).amountInput).toBe('12.50');
  });

  it('is clean until something changes, and ignores equivalent amounts and note whitespace', () => {
    const a: RecurringForm = { ...formFromTemplate(base(), 'de', true), amountInput: '12,5' };
    expect(isRecurringFormDirty(a, { ...a }, 'de')).toBe(false);
    expect(isRecurringFormDirty(a, { ...a, amountInput: '12,50' }, 'de')).toBe(false);
    expect(isRecurringFormDirty(a, { ...a, note: '  ' }, 'de')).toBe(false);
    expect(isRecurringFormDirty(a, { ...a, amountInput: '13' }, 'de')).toBe(true);
    expect(isRecurringFormDirty(a, { ...a, frequency: 'weekly' }, 'de')).toBe(true);
    expect(isRecurringFormDirty(a, { ...a, endDate: '2027-01-01' }, 'de')).toBe(true);
    expect(isRecurringFormDirty(a, { ...a, transactionType: 'income' }, 'de')).toBe(true);
  });

  it('names the first wrong field instead of saving', () => {
    const form = formFromTemplate(base(), 'de', true);
    expect(templateFromForm(base(), form, 'de')).toEqual({ ok: false, error: 'amount' });
    expect(templateFromForm(base(), { ...form, amountInput: '0' }, 'de')).toEqual({ ok: false, error: 'amount' });
    expect(templateFromForm(base(), { ...form, amountInput: '9', categoryId: '' }, 'de')).toEqual({ ok: false, error: 'category' });
    expect(templateFromForm(base(), { ...form, amountInput: '9', intervalInput: '0' }, 'de')).toEqual({ ok: false, error: 'interval' });
    expect(templateFromForm(base(), { ...form, amountInput: '9', intervalInput: '1.5' }, 'de')).toEqual({ ok: false, error: 'interval' });
    expect(templateFromForm(base(), { ...form, amountInput: '9', intervalInput: '366' }, 'de')).toEqual({ ok: false, error: 'interval' });
    expect(templateFromForm(base(), { ...form, amountInput: '9', endDate: '2026-11-06' }, 'de')).toEqual({ ok: false, error: 'end' });
  });

  it('builds a valid template with the same recurrence fields as before', () => {
    const form = { ...formFromTemplate(base(), 'de', true), amountInput: '849,00', note: ' rent ', intervalInput: '2', frequency: 'weekly' as const };
    const result = templateFromForm(base(), form, 'de');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template).toMatchObject({
      amount: 849,
      note: 'rent',
      interval: 2,
      frequency: 'weekly',
      startDate: '2026-11-07',
      endDate: null,
      nextIndex: 0,
      nextDate: '2026-11-07',
      timeZone: 'Europe/Berlin',
      enabled: true,
    });
  });
});

describe('recurring schedule in words', () => {
  it('says "every month" for one and "every 2 weeks" for more', () => {
    expect(scheduleText('monthly', 1, tr)).toBe('every month');
    expect(scheduleText('weekly', 2, tr)).toBe('every 2 weeks');
    expect(scheduleText('daily', 1, tr)).toBe('every day');
  });

  it('formats a due date without the year when it is this year', () => {
    const today = new Date(2026, 10, 7);
    expect(formatDueDate('2026-12-07', 'en-US', today)).toBe('Dec 7');
    expect(formatDueDate('2027-01-07', 'en-US', today)).toBe('Jan 7, 2027');
    expect(formatDueDate('2026-12-07', 'de-DE', today)).toBe('7. Dez.');
  });
});
