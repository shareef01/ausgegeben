import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MoneyTextProps {
  amount: number | string;
  currencyCode?: string;
  className?: string;
  color?: 'income' | 'expense' | 'transfer' | 'default';
  prefix?: string;
}

export const MoneyText = ({
  amount,
  currencyCode = 'EUR',
  className,
  color = 'default',
  prefix = ''
}: MoneyTextProps) => {
  const formatted = typeof amount === 'number'
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: currencyCode,
      }).format(amount)
    : amount;

  const colorClasses = {
    income: 'text-income',
    expense: 'text-expense',
    transfer: 'text-transfer',
    default: 'text-on-background',
  };

  return (
    <span className={cn('font-medium', colorClasses[color], className)}>
      {prefix}{formatted}
    </span>
  );
};
