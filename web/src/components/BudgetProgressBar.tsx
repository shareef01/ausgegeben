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

  return (
    <div className="budget-bar">
      <div className="budget-bar__labels">
        <span>{t('budgetMonthlyLabel')}</span>
        <span style={{ color: overBudget ? 'var(--color-expense)' : undefined }}>
          {t('budgetProgress', { spent: formatAmount(spent, currency), budget: formatAmount(budget, currency) })}
        </span>
      </div>
      <div className="budget-bar__track">
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
        <p className="budget-bar__over">
          {t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })}
        </p>
      ) : null}
    </div>
  );
}
