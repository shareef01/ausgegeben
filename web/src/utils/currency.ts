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

/** Currency's decimal separator — mirrors Android CurrencyUtils (EUR uses comma; USD/GBP/CHF use dot). */
export function decimalSeparatorFor(currency: string): ',' | '.' {
  return currency === 'EUR' ? ',' : '.';
}

/**
 * Currency-aware parse. Locale-formatted input matches Android
 * CurrencyUtils.parseAmount ("1.234,56" EUR / "1,234.56" USD), and a single
 * separator with 1–2 trailing digits is always a decimal point, so "12.50"
 * typed on a dot-only mobile keyboard still parses as 12.5 for EUR users.
 */
export function parseAmount(input: string, currency = 'EUR'): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the later one is the decimal separator, the other is grouping.
    const dec = lastDot > lastComma ? '.' : ',';
    const other = dec === '.' ? ',' : '.';
    normalized = cleaned.split(other).join('').replace(dec, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const last = Math.max(lastDot, lastComma);
    const repeated = cleaned.indexOf(sep) !== last;
    const grouping = decimalSeparatorFor(currency) === ',' ? '.' : ',';
    const digitsAfter = cleaned.length - last - 1;
    if (repeated || (sep === grouping && digitsAfter === 3)) {
      normalized = cleaned.split(sep).join(''); // thousands grouping
    } else {
      normalized = cleaned.replace(sep, '.'); // decimal
    }
  } else {
    normalized = cleaned;
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatAmountForInput(amount: number, currency = 'EUR'): string {
  const text = amount.toFixed(2);
  return decimalSeparatorFor(currency) === ',' ? text.replace('.', ',') : text;
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
