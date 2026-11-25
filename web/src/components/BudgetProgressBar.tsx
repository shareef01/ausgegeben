import { formatAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';
import { useCssProps } from '@/utils/cssVars';
import { usePreferencesStore } from '@/services/preferencesStore';

interface BudgetProgressBarProps {
  spent: number;
  budget: number;
  currency: string;
  /** Current-month expenses dated tomorrow or later; informational, never counted as spent. */
  upcoming?: number;
  incomplete?: boolean;
}

export function BudgetProgressBar({ spent, budget, currency, upcoming = 0, incomplete = false }: BudgetProgressBarProps) {
  const { t } = useTranslation();
  const locale = usePreferencesStore((s) => s.locale);
  const ratio = budget > 0 ? Math.max(spent / budget, 0) : 0;
  const overBudget = budget > 0 && spent > budget;
  const anticipated = spent + upcoming;
  const projectedOver = !overBudget && anticipated > budget;
  const reachedBudget = spent === budget;
  const nearLimit = ratio >= 0.8 && !overBudget && !projectedOver && !reachedBudget;
  const fillRef = useCssProps<HTMLDivElement>({
    '--bar-width': `${Math.min(ratio, 1) * 100}%`,
    '--bar-color': overBudget ? 'var(--color-expense-text)' : projectedOver ? 'var(--color-warning)' : 'var(--color-accent)',
  });

  if (budget <= 0) return null;
  const used = t('budgetUsed', { percent: new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(ratio) });
  const status = overBudget
    ? t('budgetOverBy', { amount: formatAmount(spent - budget, currency) })
    : reachedBudget ? t('budgetReached') : t('budgetRemaining', { amount: formatAmount(budget - spent, currency) });
  const label = `${t('budgetMonthlyLabel')}: ${formatAmount(spent, currency)} / ${formatAmount(budget, currency)}`;
  const projectedStatus = projectedOver
    ? t('budgetProjectedExceed', { amount: formatAmount(anticipated - budget, currency) })
    : null;

  return (
    <div className="budget-bar px-1">
      <div className="budget-bar__labels">
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
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        aria-valuetext={used}
      >
        <div ref={fillRef} className="budget-bar__fill" />
      </div>
      <p className="budget-bar__status tabular-nums">
        <span>{used}</span>
        {incomplete && !overBudget ? null : <span className={overBudget ? 'budget-bar__spent--over' : undefined}>{status}</span>}
      </p>
      {incomplete || nearLimit ? (
        <p className="budget-bar__hint">{t(incomplete ? 'recordCacheIncomplete' : 'budgetNearLimit')}</p>
      ) : null}
      {projectedStatus && (
        <p className="budget-bar__projected tabular-nums" role="status">{projectedStatus}</p>
      )}
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
