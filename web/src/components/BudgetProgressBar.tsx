import type { CSSProperties } from 'react';
import { formatAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';

interface BudgetProgressBarProps {
  spent: number;
  budget: number;
  currency: string;
}

export function BudgetProgressBar({ spent, budget, currency }: BudgetProgressBarProps) {
  const { t } = useTranslation();
  if (budget <= 0) return null;

  const ratio = Math.min(spent / budget, 1);
  const overBudget = spent > budget;
  const percent = Math.round(ratio * 100);
  const label = `${t('budgetMonthlyLabel')}: ${formatAmount(spent, currency)} / ${formatAmount(budget, currency)}`;

  return (
    <div className="budget-bar px-1">
      <div className="budget-bar__labels flex justify-between items-end mb-3">
        <span className="field__label">{t('budgetMonthlyLabel')}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: overBudget ? 'var(--color-expense)' : 'var(--color-on-surface-variant)' }}>
          {formatAmount(spent, currency)} <span className="opacity-40 font-medium">/ {formatAmount(budget, currency)}</span>
        </span>
      </div>
      <div
        className="budget-bar__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
      >
        <div
          className="budget-bar__fill"
          style={{
            width: `${ratio * 100}%`,
            '--bar-gradient': overBudget ? 'var(--gradient-expense)' : 'var(--gradient-income)',
            '--bar-glow': overBudget ? 'var(--color-expense)' : 'var(--color-income)',
          } as CSSProperties}
        />
      </div>
      {overBudget ? (
        <p className="budget-bar__over tabular-nums">
          {t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })}
        </p>
      ) : null}
    </div>
  );
}
