import { describe, it, expect } from 'vitest';
import { CategoryValidator } from './categoryValidator';

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
