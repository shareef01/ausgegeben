import { DonutChart } from '@/components/DonutChart';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';

interface IncomeExpenseOverviewChartProps {
  periodKey: string;
  expenseTotal: number;
  incomeTotal: number;
  currency: string;
}

export function IncomeExpenseOverviewChart({ periodKey, expenseTotal, incomeTotal, currency }: IncomeExpenseOverviewChartProps) {
  const { t } = useTranslation();
  const combined = expenseTotal + incomeTotal;
  if (combined <= 0) return null;

  const expensePercent = Math.round((expenseTotal / combined) * 100);
  const incomePercent = 100 - expensePercent;
  const net = incomeTotal - expenseTotal;
  const netColor = net > 0 ? 'var(--color-income)' : net < 0 ? 'var(--color-expense)' : 'var(--color-on-background)';

  const segments = [
    { label: t('summarySpent'), value: expenseTotal, color: 'var(--color-expense)' },
    { label: t('summaryEarned'), value: incomeTotal, color: 'var(--color-income)' },
  ].filter((s) => s.value > 0);

  return (
    <div className="card insights-overview-card insights-glass-island chart-reveal-in">
      <div className="insights-overview-card__title">{t('chartOverviewTitle')}</div>
      <div className="insights-overview-card__chart">
        <DonutChart
          segments={segments}
          size={176}
          animationKey={`${periodKey}:${expenseTotal}:${incomeTotal}`}
          center={{
            label: t('chartNetLabel'),
            value: formatAmount(net, currency),
            valueColor: netColor,
          }}
        />
      </div>
      <div className="insights-overview-card__legend">
        <OverviewLegendItem
          color="var(--color-expense)"
          label={t('summarySpent')}
          value={formatAmount(expenseTotal, currency)}
          percent={expensePercent}
        />
        <OverviewLegendItem
          color="var(--color-income)"
          label={t('summaryEarned')}
          value={formatAmount(incomeTotal, currency)}
          percent={incomePercent}
        />
      </div>
    </div>
  );
}

function OverviewLegendItem({
  color,
  label,
  value,
  percent,
}: {
  color: string;
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="insights-overview-legend__item">
      <span className="category-metric-row__swatch" aria-hidden>
        <span className="category-metric-row__dot" style={{ background: color }} />
      </span>
      <div className="insights-overview-legend__text">
        <span className="insights-overview-legend__label">{label}</span>
        <span className="insights-overview-legend__value">{value} · {percent}%</span>
      </div>
    </div>
  );
}
