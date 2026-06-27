import { describe, expect, it } from 'vitest';
import {
  colorIntToHex,
  currencyLabel,
  formatAmount,
  formatAmountForInput,
  parseAmount,
  SUPPORTED_CURRENCIES,
} from '@/utils/currency';

describe('currency', () => {
  it('colorIntToHex strips alpha channel', () => {
    expect(colorIntToHex(0xff1a2b3c)).toBe('#1a2b3c');
  });

  it('formatAmount uses German separators for EUR', () => {
    expect(formatAmount(1234.56, 'EUR', false)).toBe('1.234,56');
  });

  it('formatAmount includes USD symbol', () => {
    expect(formatAmount(1234.56, 'USD')).toContain('1,234.56');
    expect(formatAmount(1234.56, 'USD')).toContain('$');
  });

  it('parseAmount handles comma and dot decimals', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
  });

  it('parseAmount returns null for invalid input', () => {
    expect(parseAmount('abc')).toBeNull();
  });

  it('formatAmountForInput uses comma decimal', () => {
    expect(formatAmountForInput(12.5)).toBe('12,50');
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
