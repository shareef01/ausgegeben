export const formatAmount = (amount: number, currencyCode: string = 'EUR') => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
};

export const parseAmount = (amountString: string): number | null => {
  const normalized = amountString.replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
};
