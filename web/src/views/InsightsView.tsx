import { ScreenTitle, EmptyState } from '@/components/ui';
import { DonutChart, segmentColor } from '@/components/DonutChart';
import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';
import { AnalyticsPeriodPicker } from '@/components/PeriodSelector';
import { useDashboardViewModel } from '@/viewmodels/useDashboardViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';
import type { Category } from '@/models/types';

export function InsightsView() {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, categories, periodOptions, setAnalyticsPeriod } = useDashboardViewModel();
  const hasData = uiState.totalExpenses > 0 || uiState.totalIncome > 0;

  const selectedOption = periodOptions.find((o) => o.storageKey === uiState.periodKey) ?? periodOptions[0];
  const selectedLabel = uiState.periodKey === 'all_time'
    ? t('periodAllTime')
    : selectedOption?.label ?? t('periodAllTime');

  return (
    <div className="insights-view page-content">
      <ScreenTitle title={t('screenBills')} />
      <div className="insights-toolbar">
        <AnalyticsPeriodPicker
          options={periodOptions}
          selectedKey={uiState.periodKey}
          selectedLabel={selectedLabel}
          onSelected={(o) => setAnalyticsPeriod(o.storageKey)}
        />
      </div>

      {!hasData ? (
        <EmptyState title={t('billsEmptyTitle')} subtitle={t('billsEmptySubtitle')} />
      ) : (
        <>
          <InsightsStatGrid income={uiState.totalIncome} expense={uiState.totalExpenses} currency={currency} />
          <div className="insights-grid">
            <CategoryCard title={t('filterExpense')} map={uiState.expensesByCategory} categories={categories} currency={currency} accent="var(--color-expense)" />
            <CategoryCard title={t('filterIncome')} map={uiState.incomeByCategory} categories={categories} currency={currency} accent="var(--color-income)" />
          </div>
          {uiState.cashFlowTrend.length > 0 ? <CashFlowCard trend={uiState.cashFlowTrend} currency={currency} /> : null}
        </>
      )}
    </div>
  );
}

function InsightsStatGrid({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const { t } = useTranslation();
  const net = income - expense;
  const netClass = net >= 0 ? 'insights-stat-card--net-positive' : 'insights-stat-card--net-negative';

  return (
    <div className="insights-stat-grid">
      <div className="insights-stat-card insights-stat-card--expense">
        <div className="insights-stat-card__label">{t('summarySpent')}</div>
        <div className="insights-stat-card__value tabular-nums" style={{ color: 'var(--color-expense)' }}>
          {formatAmount(expense, currency)}
        </div>
      </div>
      <div className={`insights-stat-card ${netClass}`}>
        <div className="insights-stat-card__label">{t('billsNet')}</div>
        <div className="insights-stat-card__value tabular-nums" style={{ color: net >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>
          {formatAmount(net, currency)}
        </div>
      </div>
      <div className="insights-stat-card insights-stat-card--income">
        <div className="insights-stat-card__label">{t('summaryEarned')}</div>
        <div className="insights-stat-card__value tabular-nums" style={{ color: 'var(--color-income)' }}>
          {formatAmount(income, currency)}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ title, map, categories, currency, accent }: { title: string; map: Map<number, number>; categories: Category[]; currency: string; accent: string }) {
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return null;
  const segments = entries.slice(0, 6).map(([catId, value], i) => {
    const cat = categories.find((c) => c.id === catId);
    return { label: cat?.name ?? '?', value, color: cat ? segmentColor(cat.colorInt) : `hsl(${i * 40}, 60%, 55%)` };
  });

  return (
    <div className="card card--pressable insights-category-card">
      <div className="insights-category-card__title" style={{ color: accent }}>{title}</div>
      <DonutChart segments={segments} size={148} center={{ value: formatAmount(total, currency) }} />
      <div className="chart-legend">
        {entries.slice(0, 4).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === catId);
          const pct = Math.round((amount / total) * 100);
          const dotColor = cat ? segmentColor(cat.colorInt) : 'var(--color-outline)';
          return (
            <div key={catId} className="chart-legend__row">
              <span className="chart-legend__dot" style={{ background: dotColor }} />
              <span className="chart-legend__name">{cat?.name ?? '?'}</span>
              <span className="chart-legend__value">{formatAmount(amount, currency)} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashFlowCard({ trend, currency }: { trend: { label: string; income: number; expense: number }[]; currency: string }) {
  const { t } = useTranslation();
  const totalIncome = trend.reduce((s, p) => s + p.income, 0);
  const totalExpense = trend.reduce((s, p) => s + p.expense, 0);

  return (
    <div className="card card--pressable insights-cashflow-card">
      <div className="insights-cashflow-card__header">
        <div>
          <div className="insights-cashflow-card__title">{t('billsCashFlow')}</div>
          <div className="insights-cashflow-card__subtitle">
            {t('billsCashFlowSubtitle', {
              income: formatAmount(totalIncome, currency),
              expense: formatAmount(totalExpense, currency),
            })}
          </div>
        </div>
        <CashFlowLegend />
      </div>
      <CashFlowChart trend={trend} />
      <div className="insights-cashflow-card__axis">
        <span>{trend[0]?.label}</span>
        <span>{trend[trend.length - 1]?.label}</span>
      </div>
      <div className="insights-cashflow-card__hint">
        {t('billsCashFlowHint', { currency })}
      </div>
    </div>
  );
}
