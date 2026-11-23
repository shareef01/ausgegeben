import { formatAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';
import { useCssProps } from '@/utils/cssVars';

interface BudgetProgressBarProps {
  spent: number;
  budget: number;
  currency: string;
  /** Current-month expenses dated tomorrow or later; informational, never counted as spent. */
  upcoming?: number;
}

export function BudgetProgressBar({ spent, budget, currency, upcoming = 0 }: BudgetProgressBarProps) {
  const { t } = useTranslation();
  const ratio = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const overBudget = budget > 0 && spent > budget;
  const fillRef = useCssProps<HTMLDivElement>({
    '--bar-width': `${ratio * 100}%`,
    '--bar-gradient': overBudget ? 'var(--gradient-expense)' : 'var(--gradient-income)',
    '--bar-glow': overBudget ? 'var(--color-expense)' : 'var(--color-income)',
  });

  if (budget <= 0) return null;

  const percent = Math.round(ratio * 100);
  const label = `${t('budgetMonthlyLabel')}: ${formatAmount(spent, currency)} / ${formatAmount(budget, currency)}`;

  return (
    <div className="budget-bar px-1">
      <div className="budget-bar__labels flex justify-between items-end mb-3">
        <span className="field__label">{t('budgetMonthlyLabel')}</span>
        <span className={`text-xs font-bold tabular-nums budget-bar__spent${overBudget ? ' budget-bar__spent--over' : ''}`}>
          {formatAmount(spent, currency)} <span className="budget-bar__limit font-medium">/ {formatAmount(budget, currency)}</span>
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
        <div ref={fillRef} className="budget-bar__fill" />
      </div>
      {overBudget ? (
        <p className="budget-bar__over tabular-nums">
          {t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })}
        </p>
      ) : null}
      {upcoming > 0 ? (
        // F-05: the bar above stays actual-spend / budget. Future-dated rows and their
        // anticipated total are disclosed separately so "spent" cannot be misread.
        <p className="budget-bar__upcoming tabular-nums">
          {t('budgetUpcomingAnticipated', {
            upcoming: formatAmount(upcoming, currency),
            anticipated: formatAmount(spent + upcoming, currency),
          })}
        </p>
      ) : null}
    </div>
  );
}
