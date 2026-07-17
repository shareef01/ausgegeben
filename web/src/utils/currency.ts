import type { Locale, TranslationKey } from '@/i18n';
import { getLocale, localeTag, t } from '@/i18n';

export function colorIntToHex(colorInt: number): string {
  const rgb = colorInt & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

/** Format money using the app language locale (not currency→locale heuristics). */
export function formatAmount(
  amount: number,
  currency = 'EUR',
  showSymbol = true,
  locale?: Locale,
): string {
  const tag = localeTag(locale ?? getLocale());
  if (!showSymbol) {
    return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }
  return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(amount);
}

export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[^\d.,-]/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatAmountForInput(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

const CURRENCY_LABEL_KEYS: Record<string, TranslationKey> = {
  EUR: 'currencyEur',
  USD: 'currencyUsd',
  GBP: 'currencyGbp',
  CHF: 'currencyChf',
};

export function currencyLabel(code: string): string {
  const key = CURRENCY_LABEL_KEYS[code];
  return key ? t(key) : code;
}
