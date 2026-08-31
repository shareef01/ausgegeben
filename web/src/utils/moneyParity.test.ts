import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatAmount, formatAmountForInput, parseAmount } from '@/utils/currency';
import { formatCsvAmount } from '@/utils/analytics';

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../testdata/money-parity.json'), 'utf8'),
) as {
  display: Array<{
    amount: number;
    currency: string;
    language: 'en' | 'de';
    showSymbol: boolean;
    formatted: string;
  }>;
  parse: Array<{ input: string; currency: string; value: number }>;
  csv: Array<{ amount: number; cell: string }>;
  input: Array<{ amount: number; currency: string; text: string }>;
};

describe('money-parity.json (shared with Android MoneyParityTest)', () => {
  it('display matches app-language formatting', () => {
    for (const row of fixture.display) {
      expect(formatAmount(row.amount, row.currency, row.showSymbol, row.language)).toBe(row.formatted);
    }
  });

  /**
   * Edit-form prefill. Android rendered this with DecimalFormat("0.##"), which drops
   * trailing zeros, so a stored 12.50 prefilled "12,5" there and "12,50" here — the same
   * transaction shown differently depending on which client opened it.
   */
  it('edit-form prefill matches Android formatAmountForInput', () => {
    for (const row of fixture.input) {
      expect(formatAmountForInput(row.amount, row.currency)).toBe(row.text);
    }
  });

  it('parse matches Android CurrencyUtils vectors', () => {
    for (const row of fixture.parse) {
      expect(parseAmount(row.input, row.currency)).toBe(row.value);
    }
  });

  it('csv cells are two-decimal US amounts', () => {
    for (const row of fixture.csv) {
      expect(formatCsvAmount(row.amount)).toBe(row.cell);
    }
  });
});
