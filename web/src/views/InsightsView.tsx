import { useMemo } from 'react';
import { EmptyState, LoadingListSkeleton, PageTitle } from '@/components/ui';
import { DonutChart, segmentColor } from '@/components/DonutChart';
import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';
import { AnalyticsPeriodPicker } from '@/components/PeriodSelector';
import { useInsightsViewModel } from '@/viewmodels/useInsightsViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatAmount, formatCompactAmount } from '@/utils/currency';
import type { Category } from '@/models/types';
import { useHaptics } from '@/hooks/useHaptics';
import { IconInsights } from '@/components/Icons';
import { useCssProps } from '@/utils/cssVars';

export function InsightsView({ onAdd }: { onAdd?: () => void }) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, categories, periodOptions, setAnalyticsPeriod, reload } = useInsightsViewModel();
  const haptics = useHaptics();
  const hasData =
    uiState.totalExpenses > 0 ||
    uiState.totalIncome > 0 ||
    uiState.totalTransfers > 0;
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
      <PageTitle text={t('screenInsights')} icon={IconInsights} />

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
          ) : (
            <>
              {uiState.dataTruncated ? (
                <p className="data-truncated-notice" role="status">
                  {t('dataTruncatedNotice')}
                </p>
              ) : null}
              {!hasData ? (
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
                {uiState.expensesByCategory.size > 0 ? (
                  <CategoryCard title={t('filterExpense')} map={uiState.expensesByCategory} categories={categories} currency={currency} accent="var(--color-expense)" />
                ) : null}
                {uiState.incomeByCategory.size > 0 ? (
                  <CategoryCard title={t('filterIncome')} map={uiState.incomeByCategory} categories={categories} currency={currency} accent="var(--color-income)" />
                ) : null}
                {uiState.transfersByCategory.size > 0 ? (
                  <CategoryCard title={t('filterTransfer')} map={uiState.transfersByCategory} categories={categories} currency={currency} accent="var(--color-transfer, var(--color-outline))" />
                ) : null}
              </div>

              {uiState.cashFlowTrend.length > 0 ? (
                <CashFlowCard trend={uiState.cashFlowTrend} currency={currency} />
              ) : null}
            </div>
          )}
            </>
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

const TOP_CATEGORY_COUNT = 6;

function CategoryCard({ title, map, categories, currency, accent }: CategoryCardProps) {
  const { t } = useTranslation();
  const entries = useMemo(() => [...map.entries()].sort((a, b) => b[1] - a[1]), [map]);
  const total = useMemo(() => entries.reduce((s, [, v]) => s + v, 0), [entries]);

  // Top categories plus an aggregate "other" so the donut and the percentages
  // always account for 100% of the period, even with many small categories.
  const displayEntries = useMemo(() => {
    const top = entries.slice(0, TOP_CATEGORY_COUNT);
    const restTotal = entries.slice(TOP_CATEGORY_COUNT).reduce((s, [, v]) => s + v, 0);
    const rows: { key: string; name: string; value: number; color: string }[] = top.map(([catId, value], i) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        key: catId,
        name: cat?.name ?? '?',
        value,
        color: cat ? segmentColor(cat.colorInt, i) : segmentColor(0xff7eb0e8, i),
      };
    });
    if (restTotal > 0) {
      rows.push({
        key: '__other__',
        name: t('categoryOther'),
        value: Math.round(restTotal * 100) / 100,
        color:
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-on-surface-variant')
            .trim() || '#8B8B96',
      });
    }
    return rows;
  }, [entries, categories, t]);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    return displayEntries.map(({ name, value, color }) => ({ label: name, value, color }));
  }, [displayEntries, total]);

  if (total <= 0) return null;

  return (
    <div className="insights-category-card card">
      <AccentTitle accent={accent}>{title}</AccentTitle>
      <div className="insights-category-card__chart">
        <DonutChart segments={segments} size={148} center={{ value: formatCompactAmount(total, currency) }} />
      </div>
      <ul className="insights-category-card__list">
        {displayEntries.map(({ key, name, value, color }) => {
          const pct = Math.round((value / total) * 100);
          return (
            <li key={key} className="insights-category-card__row">
              <AccentDot color={color} />
              <span className="insights-category-card__name">{name}</span>
              <span className="insights-category-card__amount">{formatAmount(value, currency)}</span>
              <span className="insights-category-card__pct">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccentTitle({ accent, children }: { accent: string; children: string }) {
  const ref = useCssProps<HTMLHeadingElement>({ '--card-accent': accent });
  return (
    <h2 ref={ref} className="insights-category-card__title">
      {children}
    </h2>
  );
}

function AccentDot({ color }: { color: string }) {
  const ref = useCssProps<HTMLSpanElement>({ '--dot-color': color });
  return <span ref={ref} className="insights-category-card__dot" aria-hidden />;
}

function CashFlowCard({ trend, currency }: { trend: { label: string; income: number; expense: number }[]; currency: string }) {
  const { t } = useTranslation();
  const totalIncome = useMemo(() => trend.reduce((s, p) => s + p.income, 0), [trend]);
  const totalExpense = useMemo(() => trend.reduce((s, p) => s + p.expense, 0), [trend]);

  return (
    <div className="insights-cashflow-card card">
      <div className="insights-cashflow-card__header">
        <div>
          <div className="insights-cashflow-card__label">{t('billsCashFlow')}</div>
          <div className="insights-cashflow-card__subtitle tabular-nums">
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
