import { describe, expect, it } from 'vitest';
import {
  colorIntToHex,
  currencyLabel,
  decimalSeparator,
  formatAmount,
  formatAmountForInput,
  handleNumpadKey,
  numpadBackspace,
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

  it('handleNumpadKey replaces leading zero and limits fraction digits', () => {
    expect(handleNumpadKey('0', '5', ',')).toBe('5');
    expect(handleNumpadKey('12', ',', ',')).toBe('12,');
    expect(handleNumpadKey('12,34', '5', ',')).toBe('12,34');
    expect(handleNumpadKey('12,3', '4', ',')).toBe('12,34');
    expect(handleNumpadKey('12,34', '5', ',')).toBe('12,34');
  });

  it('numpadBackspace keeps a single zero minimum', () => {
    expect(numpadBackspace('123')).toBe('12');
    expect(numpadBackspace('0')).toBe('0');
    expect(numpadBackspace('5')).toBe('0');
  });

  it('decimalSeparator follows currency locale', () => {
    expect(decimalSeparator('EUR')).toBe(',');
    expect(decimalSeparator('USD')).toBe('.');
  });
});
