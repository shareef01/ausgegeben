import { describe, it, expect } from 'vitest';
import { CategoryValidator, isRulesWritableCategory } from './categoryValidator';

describe('CategoryValidator', () => {
  it('sanitizes whitespace and leading/trailing junk', () => {
    expect(CategoryValidator.sanitize('   Groceries   ')).toBe('Groceries');
    expect(CategoryValidator.sanitize(';--> Shopping ;;;')).toBe('Shopping');
    expect(CategoryValidator.sanitize('Food   &   Drinks')).toBe('Food & Drinks');
    expect(CategoryValidator.sanitize(';;;;')).toBe('');
  });

  it('validates legitimate categories including international and umlauts', () => {
    expect(CategoryValidator.isValid('Groceries')).toBe(true);
    expect(CategoryValidator.isValid('Lebensmittel')).toBe(true);
    expect(CategoryValidator.isValid('Café & Bäckerei')).toBe(true);
    expect(CategoryValidator.isValid('Miete (warm)')).toBe(true);
    expect(CategoryValidator.isValid('Überweisungen')).toBe(true);
    expect(CategoryValidator.isValid('A')).toBe(true);
    expect(CategoryValidator.isValid('123')).toBe(true);
  });

  it('rejects invalid or pure punctuation names', () => {
    expect(CategoryValidator.isValid('')).toBe(false);
    expect(CategoryValidator.isValid('   ')).toBe(false);
    expect(CategoryValidator.isValid('--->')).toBe(false);
    expect(CategoryValidator.isValid(';;;')).toBe(false);
    expect(CategoryValidator.isValid('???')).toBe(false);
    expect(CategoryValidator.isValid('...')).toBe(false);
  });

  it('enforces 80 character maximum length', () => {
    const valid80 = 'A'.repeat(80);
    const invalid81 = 'A'.repeat(81);
    expect(CategoryValidator.isValid(valid80)).toBe(true);
    expect(CategoryValidator.sanitize(invalid81).length).toBe(80);
  });
});

/**
 * Regression cover for AUS-105.
 *
 * A reorder is one atomic batch across a whole transaction type — correctly, since a
 * per-document retry would leave the type half-renumbered. The cost is that one row the
 * rules refuse takes the batch with it, so reordering failed permanently behind a generic
 * message. Screening first turns that into a nameable row.
 */
describe('isRulesWritableCategory', () => {
  const ok = {
    id: 'c1',
    name: 'Groceries',
    iconName: 'shopping_cart',
    colorInt: -2345678,
    transactionType: 'expense',
    sortOrder: 0,
  };

  it('accepts a well-formed category', () => {
    expect(isRulesWritableCategory(ok)).toBe(true);
  });

  it('accepts a legacy name the name validator would reject', () => {
    // The rules only bound length; rejecting these here would freeze rows the server
    // accepts, which is the opposite of the problem being solved.
    expect(isRulesWritableCategory({ ...ok, name: '--->' })).toBe(true);
    expect(isRulesWritableCategory({ ...ok, name: '🙂' })).toBe(true);
  });

  it('rejects the blank name and blank icon that break a reorder batch', () => {
    expect(isRulesWritableCategory({ ...ok, name: '' })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, iconName: '' })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, name: undefined })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, iconName: undefined })).toBe(false);
  });

  it('rejects an out-of-enum transactionType', () => {
    expect(isRulesWritableCategory({ ...ok, transactionType: 'Expense' })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, transactionType: 'savings' })).toBe(false);
  });

  it('counts characters, not UTF-16 units, so emoji names are not over-rejected', () => {
    // A smiling-face emoji has .length 2. Counting code units would reject 50 of them as
    // "100 characters" even though the rules accept them, turning this guard into the
    // very failure it prevents.
    const emoji = String.fromCodePoint(0x1f642);
    expect(isRulesWritableCategory({ ...ok, name: emoji.repeat(50) })).toBe(true);
    expect(isRulesWritableCategory({ ...ok, name: emoji.repeat(80) })).toBe(true);
    expect(isRulesWritableCategory({ ...ok, name: emoji.repeat(81) })).toBe(false);
  });

  it('enforces the rules bounds on length, colour and sortOrder', () => {
    expect(isRulesWritableCategory({ ...ok, name: 'n'.repeat(80) })).toBe(true);
    expect(isRulesWritableCategory({ ...ok, name: 'n'.repeat(81) })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, iconName: 'i'.repeat(63) })).toBe(true);
    expect(isRulesWritableCategory({ ...ok, iconName: 'i'.repeat(64) })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, colorInt: 2147483648 })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, colorInt: Number.NaN })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, sortOrder: -1 })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, sortOrder: 10000 })).toBe(false);
    expect(isRulesWritableCategory({ ...ok, sortOrder: 9999 })).toBe(true);
  });
});
