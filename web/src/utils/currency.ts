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

/** Compact currency for tight UI (donut centers). Uses compact notation above 10k. */
export function formatCompactAmount(
  amount: number,
  currency = 'EUR',
  locale?: Locale,
): string {
  const tag = localeTag(locale ?? getLocale());
  const abs = Math.abs(amount);
  if (abs < 10_000) {
    return formatAmount(amount, currency, true, locale);
  }
  return new Intl.NumberFormat(tag, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: abs >= 1_000_000 ? 1 : 0,
  }).format(amount);
}

/** Currency's decimal separator — mirrors Android CurrencyUtils (EUR uses comma; USD/GBP/CHF use dot). */
export function decimalSeparatorFor(currency: string): ',' | '.' {
  return currency === 'EUR' ? ',' : '.';
}

/**
 * Strict, currency-aware parse. The same rules as Android CurrencyUtils.parseAmount,
 * pinned for both by testdata/money-parity.json:
 *
 * - Only digits, "." and "," after trimming; any letter, sign, symbol or inner space
 *   rejects the whole input ("12abc" and "1-2" are null, not 12 or 1).
 * - With both separators, the later one is the decimal point ("1.234,56", "1,234.56").
 * - A lone separator that repeats, or is the currency's grouping separator followed by
 *   exactly three digits, is thousands grouping ("1.234.567", "1.234" for EUR).
 *   Otherwise it is the decimal point, so "12.50" typed on a dot-only keyboard is 12.5
 *   for EUR users too.
 * - Grouping must be well formed (1–3 digits, then groups of exactly 3), and at most two
 *   decimals are allowed, so ambiguous input such as "1,234" for EUR is refused rather
 *   than guessed. A trailing decimal separator ("12,") is accepted, for half-typed input.
 */
export function parseAmount(input: string, currency = 'EUR'): number | null {
  const s = input.trim();
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = s;
  let fraction: string | null = null;
  let grouping: string | null = null;
  if (lastDot !== -1 && lastComma !== -1) {
    const dec = lastDot > lastComma ? '.' : ',';
    const decAt = s.indexOf(dec);
    if (decAt !== s.lastIndexOf(dec)) return null;
    intPart = s.slice(0, decAt);
    fraction = s.slice(decAt + 1);
    grouping = dec === '.' ? ',' : '.';
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const last = Math.max(lastDot, lastComma);
    const repeated = s.indexOf(sep) !== last;
    const currencyGrouping = decimalSeparatorFor(currency) === ',' ? '.' : ',';
    if (repeated || (sep === currencyGrouping && s.length - last - 1 === 3)) {
      grouping = sep;
    } else {
      intPart = s.slice(0, last);
      fraction = s.slice(last + 1);
    }
  }
  if (grouping !== null) {
    const wellGrouped = grouping === '.' ? /^\d{1,3}(?:\.\d{3})+$/ : /^\d{1,3}(?:,\d{3})+$/;
    if (!wellGrouped.test(intPart)) return null;
    intPart = intPart.split(grouping).join('');
  }
  if (!/^\d*$/.test(intPart)) return null;
  if (fraction !== null && !/^\d{0,2}$/.test(fraction)) return null;
  if (intPart === '' && !fraction) return null;
  const value = Number(`${intPart || '0'}.${fraction || '0'}`);
  return Number.isFinite(value) ? value : null;
}

/**
 * Prefill string for the amount field when editing an existing transaction.
 *
 * Always two decimals, matching Android's DecimalFormat("0.00"). Android used "0.##",
 * which drops trailing zeros, so the same stored 12.50 prefilled as "12,5" there and
 * "12,50" here — the same transaction rendering differently depending on which client
 * opened it. Both re-parse correctly, so nothing was miscalculated; it was purely a
 * visible parity gap. Asserted by MoneyParityTest / moneyParity.test.ts.
 */
/**
 * Short currency label for chart axes, in the app locale: "€1.2K" / "1,2 Tsd. €".
 *
 * Intl's German compact notation leaves thousands unabbreviated ("123.456,8 €"), which does
 * not fit an axis gutter, so German thousands use the standard "Tsd." abbreviation. Axis
 * labels only — summaries and tooltips keep exact amounts via formatAmount.
 */
export function formatAxisAmount(amount: number, currency = 'EUR', locale?: Locale): string {
  const loc = locale ?? getLocale();
  const tag = localeTag(loc);
  const abs = Math.abs(amount);
  if (abs < 1000) {
    return new Intl.NumberFormat(tag, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  }
  if (loc === 'de' && abs < 1_000_000) {
    return new Intl.NumberFormat(tag, { style: 'currency', currency, maximumFractionDigits: 1 })
      .formatToParts(amount / 1000)
      .map((part) => (part.type === 'literal' && /\s/.test(part.value) ? ` Tsd.${part.value}` : part.value))
      .join('');
  }
  return new Intl.NumberFormat(tag, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatAmountForInput(amount: number, currency = 'EUR'): string {
  const text = amount.toFixed(2);
  return decimalSeparatorFor(currency) === ',' ? text.replace('.', ',') : text;
}

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

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

export function sanitizeAmountInput(raw: string, currency = 'EUR'): string {
  const allowed = raw.replace(/[^\d,.]/g, '');
  if (!allowed) return '';
  const sep = decimalSeparatorFor(currency);
  const firstSepIdx = allowed.search(/[,.]/);
  if (firstSepIdx === -1) {
    const cleaned = allowed.replace(/^0+(?=\d)/, '');
    return cleaned.slice(0, 9);
  }
  const integerPart = allowed.slice(0, firstSepIdx).replace(/[,.]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  const decimalPart = allowed.slice(firstSepIdx + 1).replace(/[,.]/g, '').slice(0, 2);
  return `${integerPart || '0'}${sep}${decimalPart}`;
}


