export function colorIntToHex(colorInt: number): string {
  const rgb = colorInt & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

export function formatAmount(amount: number, currency = 'EUR', showSymbol = true): string {
  const locale = currency === 'EUR' ? 'de-DE' : currency === 'GBP' ? 'en-GB' : 'en-US';
  if (!showSymbol) {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function parseAmount(input: string): number | null {
  const normalized = input.replace(/[^\d.,-]/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

export function decimalSeparator(currency = 'EUR'): string {
  const locale = currency === 'EUR' || currency === 'CHF' ? 'de-DE' : 'en-US';
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((part) => part.type === 'decimal')?.value ?? ',';
}

/** Matches Android handleKeyInput for the add-transaction numpad. */
export function handleNumpadKey(current: string, input: string, sep: string): string {
  const value = current || '0';
  if (value === '0' && input !== sep) return input;
  if (input === sep && value.includes(sep)) return value;
  const next = value + input;
  const sepIndex = next.indexOf(sep);
  if (sepIndex >= 0 && next.length - sepIndex - 1 > 2) return value;
  if (next.replace(sep, '').replace(/\D/g, '').length > 12) return value;
  return next;
}

export function numpadBackspace(current: string): string {
  const value = current || '0';
  return value.length > 1 ? value.slice(0, -1) : '0';
}

export function formatAmountForInput(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

export function currencyLabel(code: string): string {
  const labels: Record<string, string> = {
    EUR: 'Euro (€)',
    USD: 'US Dollar ($)',
    GBP: 'British Pound (£)',
    CHF: 'Swiss Franc (CHF)',
  };
  return labels[code] ?? code;
}
