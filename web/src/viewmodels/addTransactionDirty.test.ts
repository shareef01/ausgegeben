import { describe, expect, it } from 'vitest';
import {
  isFormDirty,
  toTransactionBaseline,
  type AddTransactionForm,
  type TransactionBaseline,
} from './useAddTransactionViewModel';

/**
 * UX-1 regression suite: closing the transaction editor must prompt whenever a real change
 * would be lost — for an edit as well as a new transaction — and must *not* prompt when
 * nothing the save would persist has changed.
 *
 * The bug this replaces: the close guard asked "does this form look non-empty?", so a loaded
 * edit always looked unsaved, edits had to be excluded from the guard, and closing an edited
 * form silently threw the user's changes away.
 */

const EUR = 'EUR';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 4, 17, 14, 37, 12, 480).getTime(); // local noon-ish, with time-of-day

const createForm = (overrides: Partial<AddTransactionForm> = {}): AddTransactionForm => ({
  amountInput: '',
  transactionType: 'expense',
  categoryId: 'cat-food',
  note: '',
  dateMillis: NOW,
  ...overrides,
});

/** The form `load()` builds for an existing row: amount pre-filled with two decimals. */
const editForm = (overrides: Partial<AddTransactionForm> = {}): AddTransactionForm => ({
  amountInput: '12,50',
  transactionType: 'expense',
  categoryId: 'cat-food',
  note: 'lunch',
  dateMillis: NOW,
  ...overrides,
});

const baselineOf = (form: AddTransactionForm, currency = EUR): TransactionBaseline =>
  toTransactionBaseline(form, currency);

describe('isFormDirty — creating a transaction', () => {
  it('is not dirty when the form is untouched', () => {
    const form = createForm();
    expect(isFormDirty(form, baselineOf(form), EUR)).toBe(false);
  });

  it('is not dirty before the form has loaded', () => {
    expect(isFormDirty(createForm({ amountInput: '9,99' }), null, EUR)).toBe(false);
  });

  it('is dirty once an amount is typed', () => {
    const baseline = baselineOf(createForm());
    expect(isFormDirty(createForm({ amountInput: '9,99' }), baseline, EUR)).toBe(true);
  });

  it('is dirty once a note is typed, and clean again when it is cleared', () => {
    const baseline = baselineOf(createForm());
    expect(isFormDirty(createForm({ note: 'coffee' }), baseline, EUR)).toBe(true);
    expect(isFormDirty(createForm({ note: '' }), baseline, EUR)).toBe(false);
    // Whitespace only is not a change: save() trims the note.
    expect(isFormDirty(createForm({ note: '   ' }), baseline, EUR)).toBe(false);
  });

  it('is dirty when the user switches type or category', () => {
    const baseline = baselineOf(createForm());
    expect(isFormDirty(createForm({ transactionType: 'income' }), baseline, EUR)).toBe(true);
    expect(isFormDirty(createForm({ categoryId: 'cat-fun' }), baseline, EUR)).toBe(true);
  });

  it('is dirty when the date is moved, and clean when it is moved back', () => {
    const baseline = baselineOf(createForm());
    expect(isFormDirty(createForm({ dateMillis: NOW + 3 * DAY }), baseline, EUR)).toBe(true);
    expect(isFormDirty(createForm({ dateMillis: NOW }), baseline, EUR)).toBe(false);
  });
});

describe('isFormDirty — editing an existing transaction (the regression)', () => {
  it('is not dirty on open, even though the form is full', () => {
    // This is the case the old "looks non-empty" heuristic could not express, which is why
    // edits were excluded from the guard and closed silently.
    const form = editForm();
    expect(isFormDirty(form, baselineOf(form), EUR)).toBe(false);
  });

  it('is dirty after any edit and clean after undoing it', () => {
    const baseline = baselineOf(editForm());
    expect(isFormDirty(editForm({ amountInput: '13,00' }), baseline, EUR)).toBe(true);
    expect(isFormDirty(editForm({ amountInput: '12,50' }), baseline, EUR)).toBe(false);

    expect(isFormDirty(editForm({ note: 'lunch with Ana' }), baseline, EUR)).toBe(true);
    expect(isFormDirty(editForm({ note: 'lunch' }), baseline, EUR)).toBe(false);

    expect(isFormDirty(editForm({ categoryId: 'cat-fun' }), baseline, EUR)).toBe(true);
    expect(isFormDirty(editForm({ categoryId: 'cat-food' }), baseline, EUR)).toBe(false);
  });

  it('is dirty when only the date changes', () => {
    const baseline = baselineOf(editForm());
    expect(isFormDirty(editForm({ dateMillis: NOW - DAY }), baseline, EUR)).toBe(true);
  });

  it('treats a pure reformat of the stored amount as unchanged', () => {
    // load() prints the stored amount with two decimals; a user retyping "12,5" or "12.50"
    // has not changed the value, so it must not trigger a discard warning.
    const eurBaseline = baselineOf(editForm({ amountInput: '12,50' }), 'EUR');
    expect(isFormDirty(editForm({ amountInput: '12,5' }), eurBaseline, 'EUR')).toBe(false);
    expect(isFormDirty(editForm({ amountInput: '012,50' }), eurBaseline, 'EUR')).toBe(false);

    const usdBaseline = baselineOf(editForm({ amountInput: '12.50' }), 'USD');
    expect(isFormDirty(editForm({ amountInput: '12.50' }), usdBaseline, 'USD')).toBe(false);
    expect(isFormDirty(editForm({ amountInput: '12.5' }), usdBaseline, 'USD')).toBe(false);
  });

  it('ignores the time-of-day a stored dateMillis carries', () => {
    const baseline = baselineOf(editForm({ dateMillis: NOW }));
    // Same calendar day, different clock time (e.g. a timestamp that had a real time on it).
    expect(isFormDirty(editForm({ dateMillis: NOW + 60_000 }), baseline, EUR)).toBe(false);
    // Different day.
    expect(isFormDirty(editForm({ dateMillis: NOW + DAY }), baseline, EUR)).toBe(true);
  });

  it('is not dirty for a row whose stored category cannot be re-selected', () => {
    // An orphan or the Uncategorized sentinel blocks Save, but the user has not changed
    // anything, so closing it needs no discard warning.
    const form = editForm({ categoryId: '0' });
    expect(isFormDirty(form, baselineOf(form), EUR)).toBe(false);
  });
});

describe('toTransactionBaseline', () => {
  it('normalises amount, note and date so comparisons are about persisted values', () => {
    expect(
      toTransactionBaseline(createForm({ amountInput: '12,50', note: '  lunch  ' }), EUR),
    ).toEqual({
      amountMinor: 1250,
      transactionType: 'expense',
      categoryId: 'cat-food',
      note: 'lunch',
      dateKey: '2026-05-17',
    });
  });

  it('reads the separator of the display currency', () => {
    expect(toTransactionBaseline(createForm({ amountInput: '12,50' }), 'USD').amountMinor).toBe(1250);
    expect(toTransactionBaseline(createForm({ amountInput: '1.234,56' }), 'EUR').amountMinor).toBe(123456);
    expect(toTransactionBaseline(createForm({ amountInput: '1,234.56' }), 'USD').amountMinor).toBe(123456);
  });

  it('treats an unparsable amount as zero rather than NaN', () => {
    expect(toTransactionBaseline(createForm({ amountInput: '-' }), EUR).amountMinor).toBe(0);
  });
});
