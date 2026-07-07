import { ScreenTitle, EmptyState, LoadingListSkeleton } from '@/components/ui';
import { IconCloudOff, IconInsights } from '@/components/Icons';
import { PullToRefreshSurface } from '@/components/PullToRefreshSurface';
import { CloudSyncButton } from '@/components/CloudSyncButton';
import { AddTransactionButton } from '@/components/AddTransactionButton';
import { isCloudSyncActive } from '@/services/cloudSync';

import { DonutChart } from '@/components/DonutChart';
import { forChartDisplayHex } from '@/utils/chartColors';

import { CategoryMetricRow } from '@/components/CategoryMetricRow';
import { IncomeExpenseOverviewChart } from '@/components/IncomeExpenseOverviewChart';

import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';

import { AnalyticsPeriodPicker } from '@/components/PeriodSelector';

import { useDashboardViewModel } from '@/viewmodels/useDashboardViewModel';

import { usePreferencesStore } from '@/services/preferencesStore';

import { useTranslation } from '@/i18n';

import { formatAmount } from '@/utils/currency';

import type { Category } from '@/models/types';



export function InsightsView({ onAdd, onAddLongPress }: { onAdd?: () => void; onAddLongPress?: () => void }) {

  const { t } = useTranslation();

  const currency = usePreferencesStore((s) => s.currency);

  const { uiState, categories, periodOptions, setAnalyticsPeriod, reload, refreshFromCloud, refreshing } = useDashboardViewModel();
  const cloudSync = isCloudSyncActive();
  const pullLabel = refreshing ? t('syncInProgress') : t('recordPullToSync');

  const hasData = uiState.expensesByCategory.size > 0

    || uiState.incomeByCategory.size > 0

    || uiState.transfersByCategory.size > 0;

  const showOverview = uiState.totalExpenses > 0 || uiState.totalIncome > 0;



  const selectedOption = periodOptions.find((o) => o.storageKey === uiState.periodKey) ?? periodOptions[0];

  const selectedLabel = uiState.periodKey === 'all_time'
    ? t('periodAllTime')
    : selectedOption.label;



  const showHeaderAdd = Boolean(onAdd && hasData && !uiState.loading && !uiState.loadError);

  const headerActions = showHeaderAdd || cloudSync ? (
    <div className="record-screen-actions">
      {cloudSync ? (
        <CloudSyncButton refreshing={refreshing} onRefresh={() => void refreshFromCloud()} />
      ) : null}
      {showHeaderAdd ? (
        <AddTransactionButton
          className="btn btn-primary record-add-btn"
          onAdd={onAdd!}
          onLongPress={onAddLongPress}
        >
          {t('addTransaction')}
        </AddTransactionButton>
      ) : null}
    </div>
  ) : undefined;

  return (
    <PullToRefreshSurface
      enabled={cloudSync}
      refreshing={refreshing}
      onRefresh={() => void refreshFromCloud()}
      label={pullLabel}
    >
    <div className="insights-view page-content">

      <ScreenTitle
        title={t('screenInsights')}
        action={headerActions}
      />

      <div className="insights-view__workspace">
        <div className="insights-view__sidebar">
          <div className="insights-period-panel chart-reveal-in">
            <AnalyticsPeriodPicker
              options={periodOptions}
              selectedKey={uiState.periodKey}
              selectedLabel={selectedLabel}
              onSelected={(o) => setAnalyticsPeriod(o.storageKey)}
            />
          </div>
        </div>

        <div className="insights-view__main">

      {uiState.loadError ? (
        <EmptyState
          title={t('insightsErrorTitle')}
          subtitle={uiState.loadError}
          icon={<IconCloudOff width={28} height={28} />}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void reload(true)}>
              {t('recordErrorRetry')}
            </button>
          }
        />
      ) : uiState.loading ? (
        <div className="insights-loader" role="status" aria-live="polite" aria-busy="true">
          <LoadingListSkeleton rows={3} />
          <div className="insights-loader__gap" />
          <LoadingListSkeleton rows={3} />
        </div>
      ) : !hasData ? (

        <EmptyState
          title={t('billsEmptyTitle')}
          subtitle={t('billsEmptySubtitle')}
          hint={t('billsEmptyHint')}
          icon={<IconInsights width={28} height={28} />}
          action={

            onAdd ? (
              <AddTransactionButton
                className="btn btn-primary"
                onAdd={onAdd}
                onLongPress={onAddLongPress}
              >
                {t('recordEmptyAction')}
              </AddTransactionButton>
            ) : undefined

          }

        />

      ) : (

        <>

          {showOverview ? (
            <section
              key={`overview-${uiState.periodKey}`}
              className="insights-overview-stack chart-reveal-in"
              aria-labelledby={`insights-overview-${uiState.periodKey}`}
            >
            <h2 id={`insights-overview-${uiState.periodKey}`} className="sr-only">{t('chartOverviewTitle')}</h2>
            <IncomeExpenseOverviewChart
              periodKey={uiState.periodKey}
              expenseTotal={uiState.totalExpenses}
              incomeTotal={uiState.totalIncome}
              currency={currency}
            />
            <InsightsStatGrid
              periodKey={uiState.periodKey}
              income={uiState.totalIncome}
              expense={uiState.totalExpenses}
              currency={currency}
            />
            </section>
          ) : null}

          <section
            key={`donuts-${uiState.periodKey}`}
            className="insights-layout chart-reveal-stagger"
            aria-label={t('a11yCategoryBreakdown')}
          >
            <div className="insights-primary-row">
              <CategoryCard
                periodKey={uiState.periodKey}
                cardKey="expense"
                title={t('filterExpense')}
                map={uiState.expensesByCategory}
                categories={categories}
                currency={currency}
                accent="var(--color-expense)"
                centerLabel={t('billsTotalExpense')}
                compact
              />
              {uiState.cashFlowTrend.length > 0 ? (
                <CashFlowCard
                  periodKey={uiState.periodKey}
                  trend={uiState.cashFlowTrend}
                  currency={currency}
                  headingId={`cashflow-${uiState.periodKey}`}
                  compact
                />
              ) : null}
            </div>

            <div className="insights-secondary-grid">
              <CategoryCard
                periodKey={uiState.periodKey}
                cardKey="income"
                title={t('filterIncome')}
                map={uiState.incomeByCategory}
                categories={categories}
                currency={currency}
                accent="var(--color-income)"
                centerLabel={t('billsTotalIncome')}
                compact
              />
              <CategoryCard
                periodKey={uiState.periodKey}
                cardKey="transfer"
                title={t('filterTransfer')}
                map={uiState.transfersByCategory}
                categories={categories}
                currency={currency}
                accent="var(--color-transfer)"
                centerLabel={t('billsTotalTransfer')}
                compact
              />
            </div>
          </section>

        </>

      )}

        </div>
      </div>

    </div>
    </PullToRefreshSurface>
  );
}



function InsightsStatGrid({
  periodKey,
  income,
  expense,
  currency,
}: {
  periodKey: string;
  income: number;
  expense: number;
  currency: string;
}) {
  const { t } = useTranslation();
  const net = income - expense;
  const netClass = net >= 0 ? 'insights-stat-card--net-positive' : 'insights-stat-card--net-negative';

  return (
    <div key={periodKey} className="insights-stat-grid chart-reveal-in chart-reveal-in--delay-1" role="group" aria-label={t('a11yInsightsSummary')}>

      <div className="insights-stat-card insights-stat-card--expense">

        <div className="insights-stat-card__label">{t('summarySpent')}</div>

        <div className="insights-stat-card__value tabular-nums" style={{ color: 'var(--color-expense)' }}>

          {formatAmount(expense, currency)}

        </div>

      </div>

      <div className={`insights-stat-card insights-stat-card--net ${netClass}`}>

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



function CategoryCard({
  periodKey,
  cardKey,
  title,
  map,
  categories,
  currency,
  accent,
  centerLabel,
  compact = false,
}: {
  periodKey: string;
  cardKey: string;
  title: string;
  map: Map<number, number>;
  categories: Category[];
  currency: string;
  accent: string;
  centerLabel: string;
  compact?: boolean;
}) {

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (total <= 0) return null;

  const segments = entries.map(([catId, value], i) => {

    const cat = categories.find((c) => c.id === catId);

    return { label: cat?.name ?? '?', value, color: cat ? forChartDisplayHex(cat.colorInt, i) : `hsl(${i * 40}, 60%, 55%)` };

  });



  return (

    <article className={`card insights-category-card insights-glass-island${compact ? ' insights-category-card--compact' : ''}`} aria-labelledby={`insights-${periodKey}-${cardKey}-title`}>

      <h3 id={`insights-${periodKey}-${cardKey}-title`} className="insights-category-card__title" style={{ color: accent }}>{title}</h3>

      <div className="insights-category-card__chart">
        <DonutChart

          segments={segments}

          size={compact ? 148 : 180}

          animationKey={`${periodKey}|${entries.map(([id, v]) => `${id}:${v}`).join('|')}`}

          center={{ label: centerLabel, value: formatAmount(total, currency) }}

        />
      </div>

      <div className="category-metric-list">
        {entries.map(([catId, amount], index) => {
          const cat = categories.find((c) => c.id === catId);
          const dotColor = cat ? forChartDisplayHex(cat.colorInt, entries.findIndex(([id]) => id === catId)) : 'var(--color-outline)';

          return (
            <div key={catId}>
              <CategoryMetricRow
                name={cat?.name ?? '?'}
                amount={amount}
                total={total}
                color={dotColor}
                currency={currency}
              />
              {index < entries.length - 1 ? <div className="category-metric-row__sep" aria-hidden /> : null}
            </div>
          );
        })}
      </div>

    </article>

  );

}



function CashFlowCard({
  periodKey,
  trend,
  currency,
  headingId,
  compact = false,
}: {
  periodKey: string;
  trend: { label: string; income: number; expense: number }[];
  currency: string;
  headingId: string;
  compact?: boolean;
}) {

  const { t } = useTranslation();

  const totalIncome = trend.reduce((s, p) => s + p.income, 0);

  const totalExpense = trend.reduce((s, p) => s + p.expense, 0);



  return (

    <div className={`card insights-cashflow-card insights-glass-island${compact ? ' insights-cashflow-card--compact' : ''}`}>

      <div className="insights-cashflow-card__header">

        <div>

          <h3 id={headingId} className="insights-cashflow-card__title">{t('billsCashFlow')}</h3>

          <div className="insights-cashflow-card__subtitle">

            {t('billsCashFlowSubtitle', {

              income: formatAmount(totalIncome, currency),

              expense: formatAmount(totalExpense, currency),

            })}

          </div>

        </div>

        <CashFlowLegend />

      </div>

      <CashFlowChart periodKey={periodKey} trend={trend} ariaLabelledBy={headingId} />

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


