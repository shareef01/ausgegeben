import type { CSSProperties } from 'react';
import { formatAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';
import { useChartReveal } from '@/hooks/useChartReveal';

interface BudgetProgressBarProps {
  spent: number;
  budget: number;
  currency: string;
}

export function BudgetProgressBar({ spent, budget, currency }: BudgetProgressBarProps) {
  const { t } = useTranslation();
  if (budget <= 0) return null;

  const overBudget = spent > budget;
  const percentUsed = Math.round((spent / budget) * 100);
  const displayRatio = Math.min(spent / budget, 1);
  const barColor = overBudget
    ? 'var(--color-expense)'
    : percentUsed >= 90
      ? 'var(--color-expense)'
      : percentUsed >= 75
        ? 'var(--color-warning)'
        : 'var(--color-primary)';
  const percentColor = overBudget || percentUsed >= 90
    ? 'var(--color-expense)'
    : percentUsed >= 75
      ? 'var(--color-warning)'
      : 'var(--color-text-secondary)';
  const fillProgress = useChartReveal(`${spent}:${budget}`);
  const a11yLabel = overBudget
    ? `${t('budgetMonthlyLabel')}, over budget by ${formatAmount(spent - budget, currency)}. ${t('budgetProgress', { spent: formatAmount(spent, currency), budget: formatAmount(budget, currency) })}`
    : `${t('budgetMonthlyLabel')}, ${percentUsed}% used. ${t('budgetProgress', { spent: formatAmount(spent, currency), budget: formatAmount(budget, currency) })}`;

  return (
    <div
      className="card budget-bar insights-glass-island chart-reveal-in chart-reveal-in--delay-1"
      role="progressbar"
      aria-valuenow={percentUsed}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={a11yLabel}
    >
      <div className="budget-bar__labels" aria-hidden="true">
        <span>{t('budgetMonthlyLabel')}</span>
        <div className="budget-bar__amounts">
          <span style={{ color: overBudget ? 'var(--color-expense)' : undefined }}>
            {t('budgetProgress', { spent: formatAmount(spent, currency), budget: formatAmount(budget, currency) })}
          </span>
          {!overBudget && percentUsed > 0 ? (
            <span className="budget-bar__percent" style={{ color: percentColor }}>
              {t('budgetPercentUsed', { percent: String(percentUsed) })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="budget-bar__track" aria-hidden="true">
        <div
          className="budget-bar__fill"
          style={{
            width: `${displayRatio * fillProgress * 100}%`,
            background: barColor,
            boxShadow: `0 0 12px color-mix(in srgb, ${barColor} 40%, transparent)`,
          } as CSSProperties}
        />
      </div>
      {overBudget ? (
        <p className="budget-bar__over" aria-hidden="true">
          {t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })}
        </p>
      ) : null}
    </div>
  );
}
