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
