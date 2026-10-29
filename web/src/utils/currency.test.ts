import { describe, expect, it } from 'vitest';
import {
  colorIntToHex,
  currencyLabel,
  currencySymbol,
  formatAmount,
  formatAmountForInput,
  formatAxisAmount,
  parseAmount,
  sanitizeAmountInput,
  SUPPORTED_CURRENCIES,
} from '@/utils/currency';
import { expenseWritePayload } from '@/utils/firestorePayloads';

describe('currency', () => {
  it('currencySymbol returns expected symbols', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('CHF')).toBe('CHF');
    expect(currencySymbol('XYZ')).toBe('XYZ');
  });

  it('sanitizeAmountInput enforces single separator, max 9 int digits, max 2 decimals', () => {
    expect(sanitizeAmountInput('12.50', 'USD')).toBe('12.50');
    expect(sanitizeAmountInput('12,50', 'EUR')).toBe('12,50');
    expect(sanitizeAmountInput('12..34..56', 'USD')).toBe('12.34');
    expect(sanitizeAmountInput('12,,34,,56', 'EUR')).toBe('12,34');
    expect(sanitizeAmountInput('1234567890123.456', 'USD')).toBe('123456789.45');
    expect(sanitizeAmountInput('0005.50', 'USD')).toBe('5.50');
  });

  it('colorIntToHex strips alpha channel', () => {
    expect(colorIntToHex(0xff1a2b3c)).toBe('#1a2b3c');
  });

  it('formatAmount uses app locale separators (default en)', () => {
    // Keep in sync with CurrencyUtilsTest.kt parityCases.
    expect(formatAmount(1234.56, 'EUR', false, 'en')).toBe('1,234.56');
  });

  it('formatAmount uses German separators when locale is de', () => {
    expect(formatAmount(1234.56, 'EUR', false, 'de')).toBe('1.234,56');
  });

  it('formatAmount includes USD symbol with en locale', () => {
    const formatted = formatAmount(1234.56, 'USD', true, 'en');
    expect(formatted).toContain('1,234.56');
    expect(formatted).toContain('$');
  });

  it('formatAxisAmount abbreviates per locale and keeps the currency', () => {
    expect(formatAxisAmount(0, 'EUR', 'en')).toBe('€0');
    expect(formatAxisAmount(850, 'USD', 'en')).toBe('$850');
    expect(formatAxisAmount(1234.56, 'GBP', 'en')).toBe('£1.2K');
    expect(formatAxisAmount(1_234_567.89, 'CHF', 'en')).toBe('CHF 1.2M');
    expect(formatAxisAmount(-2500, 'EUR', 'en')).toBe('-€2.5K');
    // German compact notation would print "123.456,8 €" in full.
    expect(formatAxisAmount(123_456.78, 'EUR', 'de')).toBe('123,5 Tsd. €');
    expect(formatAxisAmount(-2500, 'CHF', 'de')).toBe('-2,5 Tsd. CHF');
    expect(formatAxisAmount(1_234_567.89, 'EUR', 'de')).toBe('1,2 Mio. €');
  });

  it('parseAmount handles comma and dot decimals', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('12.50', 'USD')).toBe(12.5);
  });

  it('parseAmount strips thousands separators (Android parity)', () => {
    expect(parseAmount('1.234,56', 'EUR')).toBe(1234.56);
    expect(parseAmount('1,234.56', 'USD')).toBe(1234.56);
    expect(parseAmount('1.234', 'EUR')).toBe(1234);
    expect(parseAmount('1,234', 'USD')).toBe(1234);
    expect(parseAmount('1.234.567', 'EUR')).toBe(1234567);
  });

  it('parseAmount treats a lone separator with 1-2 trailing digits as decimal', () => {
    expect(parseAmount('0,5', 'EUR')).toBe(0.5);
    expect(parseAmount('12.5', 'EUR')).toBe(12.5);
    expect(parseAmount('12,50', 'USD')).toBe(12.5);
  });

  it('parseAmount returns null for invalid input', () => {
    expect(parseAmount('abc')).toBeNull();
  });

  it('formatAmountForInput uses the currency decimal separator', () => {
    expect(formatAmountForInput(12.5)).toBe('12,50');
    expect(formatAmountForInput(12.5, 'USD')).toBe('12.50');
    expect(formatAmountForInput(12.5, 'CHF')).toBe('12.50');
  });

  it('currencyLabel returns friendly names', () => {
    expect(currencyLabel('EUR')).toContain('Euro');
    expect(currencyLabel('XYZ')).toBe('XYZ');
  });

  it('SUPPORTED_CURRENCIES includes core codes', () => {
    expect(SUPPORTED_CURRENCIES).toContain('EUR');
    expect(SUPPORTED_CURRENCIES).toContain('USD');
  });
});

/**
 * Data-safety contract: the currency setting is a display preference. Switching it
 * must never rescale, reinterpret or rewrite a stored amount, and there is no
 * per-expense currency or exchange-rate field to migrate. If real conversion is ever
 * added it needs its own design (rates, effective dates, migration) — these tests make
 * that deliberate rather than an accidental side effect.
 */
describe('currency is presentation-only', () => {
  it('reformats the same stored amount instead of converting it', () => {
    const stored = 1234.56;
    expect(formatAmount(stored, 'EUR', true, 'en')).toContain('1,234.56');
    expect(formatAmount(stored, 'USD', true, 'en')).toContain('1,234.56');
    expect(parseAmount(formatAmountForInput(stored, 'EUR'), 'EUR')).toBeCloseTo(stored, 10);
    expect(parseAmount(formatAmountForInput(stored, 'USD'), 'USD')).toBeCloseTo(stored, 10);
  });

  it('writes expenses with no currency or exchange-rate field', () => {
    const payload = expenseWritePayload(
      { amount: 10, dateMillis: 1, categoryId: 'cat', note: 'note', transactionType: 'expense' },
      { updatedAt: 2 },
    );
    expect(Object.keys(payload).sort()).toEqual([
      'amount',
      'categoryId',
      'dateMillis',
      'note',
      'transactionType',
      'updatedAt',
    ]);
    expect(payload).not.toHaveProperty('currency');
    expect(payload).not.toHaveProperty('exchangeRate');
  });
});
