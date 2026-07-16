import { useMemo } from 'react';
import { EmptyState, LoadingListSkeleton, SignatureText } from '@/components/ui';
import { DonutChart, segmentColor } from '@/components/DonutChart';
import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';
import { AnalyticsPeriodPicker } from '@/components/PeriodSelector';
import { useDashboardViewModel } from '@/viewmodels/useDashboardViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';
import type { Category } from '@/models/types';
import { useHaptics } from '@/hooks/useHaptics';

export function InsightsView({ onAdd }: { onAdd?: () => void }) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, categories, periodOptions, setAnalyticsPeriod, reload } = useDashboardViewModel();
  const haptics = useHaptics();
  const hasData = uiState.totalExpenses > 0 || uiState.totalIncome > 0;
  const loading = uiState.loading;

  const selectedOption = useMemo(
    () => periodOptions.find((o) => o.storageKey === uiState.periodKey) ?? periodOptions[0],
    [periodOptions, uiState.periodKey],
  );
  const selectedLabel = uiState.periodKey === 'all_time'
    ? t('periodAllTime')
    : selectedOption?.label ?? t('periodAllTime');

  return (
    <>
      <div className="page-title">
        <h1 className="page-title__text">
          <SignatureText text={t('screenInsights')} />
        </h1>
      </div>

      <div className="sidebar-layout">

        <aside className="sidebar-panel sidebar-panel--insights">
          <div className="widget-stack">
            <div className="insights-period-card card">
              <div className="insights-period-card__label">{t('analysisPeriod')}</div>
              <AnalyticsPeriodPicker
                options={periodOptions}
                selectedKey={uiState.periodKey}
                selectedLabel={selectedLabel}
                onSelected={(o) => {
                  haptics.light();
                  setAnalyticsPeriod(o.storageKey);
                }}
              />
            </div>

            {!loading && hasData ? (
              <InsightsStatGrid income={uiState.totalIncome} expense={uiState.totalExpenses} currency={currency} />
            ) : null}
          </div>
        </aside>

        <div className="content-col">
          {loading ? (
            <LoadingListSkeleton rows={8} />
          ) : uiState.loadError ? (
            <EmptyState
              title={t('errorLoadFailed')}
              subtitle={t('errorLoadFailedHint')}
              action={
                <button type="button" className="btn btn-primary" onClick={() => void reload(true)}>
                  {t('actionRetry')}
                </button>
              }
            />
          ) : !hasData ? (
            <EmptyState
              title={t('billsEmptyTitle')}
              subtitle={t('billsEmptySubtitle')}
              action={
                onAdd ? (
                  <button type="button" className="btn btn-primary" onClick={onAdd}>
                    {t('navAdd')}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="insights-main">
              <div className="insights-breakdown">
                <CategoryCard title={t('filterExpense')} map={uiState.expensesByCategory} categories={categories} currency={currency} accent="var(--color-expense)" />
                <CategoryCard title={t('filterIncome')} map={uiState.incomeByCategory} categories={categories} currency={currency} accent="var(--color-income)" />
              </div>

              {uiState.cashFlowTrend.length > 0 ? (
                <CashFlowCard trend={uiState.cashFlowTrend} currency={currency} />
              ) : null}
            </div>
          )}
        </div>

      </div>
    </>
  );
}

function InsightsStatGrid({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const { t } = useTranslation();
  const net = income - expense;
  const netTone = net >= 0 ? 'net-positive' : 'net-negative';

  return (
    <div className="insights-summary-dock card" role="group" aria-label={t('screenInsights')}>
      <div className="insights-summary-dock__row insights-summary-dock__row--expense">
        <div className="insights-summary-dock__label">{t('summarySpent')}</div>
        <div className="insights-summary-dock__value">{formatAmount(expense, currency)}</div>
      </div>
      <div className="insights-summary-dock__row insights-summary-dock__row--income">
        <div className="insights-summary-dock__label">{t('summaryEarned')}</div>
        <div className="insights-summary-dock__value">{formatAmount(income, currency)}</div>
      </div>
      <div className={`insights-summary-dock__row insights-summary-dock__row--${netTone}`}>
        <div className="insights-summary-dock__label">{t('billsNet')}</div>
        <div className="insights-summary-dock__value">{formatAmount(net, currency)}</div>
      </div>
    </div>
  );
}

interface CategoryCardProps {
  title: string;
  map: Map<string, number>;
  categories: Category[];
  currency: string;
  accent: string;
}

function CategoryCard({ title, map, categories, currency, accent }: CategoryCardProps) {
  const { t } = useTranslation();
  const entries = useMemo(() => [...map.entries()].sort((a, b) => b[1] - a[1]), [map]);
  const total = useMemo(() => entries.reduce((s, [, v]) => s + v, 0), [entries]);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    return entries.slice(0, 6).map(([catId, value], i) => {
        const cat = categories.find((c) => c.id === catId);
        return {
            label: cat?.name ?? '?',
            value,
            color: cat ? segmentColor(cat.colorInt) : `hsl(${i * 40}, 60%, 55%)`
        };
      });
  }, [entries, categories, total]);

  if (total <= 0) {
      return (
          <div className="insights-category-card card">
            <div className="insights-category-card__title" style={{ color: accent }}>{title}</div>
            <p className="insights-category-card__empty">{t('noDataForPeriod')}</p>
          </div>
      );
  }

  return (
    <div className="insights-category-card card">
      <h2 className="insights-category-card__title" style={{ color: accent }}>{title}</h2>
      <div className="insights-category-card__chart">
        <DonutChart segments={segments} size={148} center={{ value: formatAmount(total, currency) }} />
      </div>
      <ul className="insights-category-card__list">
        {entries.slice(0, 6).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === catId);
          const pct = Math.round((amount / total) * 100);
          const dotColor = cat ? segmentColor(cat.colorInt) : 'var(--color-outline)';
          return (
            <li key={catId} className="insights-category-card__row">
              <span className="insights-category-card__dot" style={{ background: dotColor }} aria-hidden />
              <span className="insights-category-card__name">{cat?.name ?? '?'}</span>
              <span className="insights-category-card__amount">{formatAmount(amount, currency)}</span>
              <span className="insights-category-card__pct">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CashFlowCard({ trend, currency }: { trend: { label: string; income: number; expense: number }[]; currency: string }) {
  const { t } = useTranslation();
  const totalIncome = useMemo(() => trend.reduce((s, p) => s + p.income, 0), [trend]);
  const totalExpense = useMemo(() => trend.reduce((s, p) => s + p.expense, 0), [trend]);

  return (
    <div className="card p-10 bg-glass border border-surface-border rounded-[2.5rem] shadow-2xl">
      <div className="flex items-start justify-between gap-6 mb-10">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">{t('billsCashFlow')}</div>
          <div className="text-sm font-bold opacity-80 tabular-nums">
            {t('billsCashFlowSubtitle', {
              income: formatAmount(totalIncome, currency),
              expense: formatAmount(totalExpense, currency),
            })}
          </div>
        </div>
        <CashFlowLegend />
      </div>
      <CashFlowChart trend={trend} currency={currency} />
    </div>
  );
}
