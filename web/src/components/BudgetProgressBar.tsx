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
  const barColor = overBudget ? 'var(--color-expense)' : 'var(--color-income)';

  return (
    <div style={{ padding: '4px 16px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{t('budgetMonthlyLabel')}</span>
        <span style={{ fontSize: '0.9375rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: overBudget ? 'var(--color-expense)' : 'var(--color-on-background)' }}>
          {t('budgetProgress', { spent: formatAmount(spent, currency), budget: formatAmount(budget, currency) })}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: 'color-mix(in srgb, var(--color-on-surface-variant) 12%, transparent)', overflow: 'hidden' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 999, background: barColor, opacity: 0.85 }} />
      </div>
      {overBudget ? (
        <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: 'var(--color-expense)' }}>
          {t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })}
        </p>
      ) : null}
    </div>
  );
}
