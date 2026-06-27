import { ScreenTitle, EmptyState } from '@/components/ui';
import { DonutChart, segmentColor } from '@/components/DonutChart';
import { PremiumPeriodSelector } from '@/components/PeriodSelector';
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

  return (
    <div className="insights-view page-content">
      <ScreenTitle title={t('screenBills')} />
      <div className="insights-toolbar">
        <PremiumPeriodSelector
          options={periodOptions}
          selected={periodOptions.find((o) => o.storageKey === uiState.periodKey) ?? periodOptions[0]}
          labelFor={(o) => o.label}
          isSelected={(a, b) => a.storageKey === b.storageKey}
          onSelected={(o) => setAnalyticsPeriod(o.storageKey)}
        />
      </div>

      {!hasData ? (
        <EmptyState title={t('billsEmptyTitle')} subtitle={t('billsEmptySubtitle')} />
      ) : (
        <>
          <OverviewCard currency={currency} income={uiState.totalIncome} expense={uiState.totalExpenses} />
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

function OverviewCard({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  const { t } = useTranslation();
  const net = income - expense;
  return (
    <div className="card" style={{ margin: '0 16px 12px', padding: 16 }}>
      <div style={{ fontWeight: 500, marginBottom: 12 }}>{t('billsOverviewTitle')}</div>
      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div style={{ color: 'var(--color-expense)' }}>{formatAmount(expense, currency)}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{t('summarySpent')}</div></div>
        <div><div style={{ color: net >= 0 ? 'var(--color-income)' : 'var(--color-expense)', fontWeight: 600 }}>{formatAmount(net, currency)}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{t('billsNet')}</div></div>
        <div><div style={{ color: 'var(--color-income)' }}>{formatAmount(income, currency)}</div><div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{t('summaryEarned')}</div></div>
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
    <div className="card" style={{ padding: '8px 0 12px' }}>
      <div style={{ padding: '8px 12px', color: accent, fontWeight: 600, fontSize: '0.875rem' }}>{title}</div>
      <DonutChart segments={segments} size={120} compact />
      <div style={{ padding: '0 12px' }}>
        {entries.slice(0, 4).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === catId);
          const pct = Math.round((amount / total) * 100);
          return (
            <div key={catId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.8125rem' }}>
              <span>{cat?.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(amount, currency)} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashFlowCard({ trend, currency }: { trend: { label: string; income: number; expense: number }[]; currency: string }) {
  const { t } = useTranslation();
  const max = Math.max(...trend.flatMap((p) => [p.income, p.expense]), 1);
  return (
    <div className="card" style={{ margin: 16, padding: 16 }}>
      <div style={{ fontWeight: 500, marginBottom: 12 }}>{t('billsCashFlow')}</div>
      <svg width="100%" height="120" viewBox={`0 0 ${trend.length * 40} 120`} preserveAspectRatio="none">
        {trend.map((p, i) => {
          const x = i * 40 + 20;
          const yIncome = 100 - (p.income / max) * 80;
          const yExpense = 100 - (p.expense / max) * 80;
          return (
            <g key={i}>
              {i > 0 ? (
                <>
                  <line x1={(i - 1) * 40 + 20} y1={100 - (trend[i - 1].income / max) * 80} x2={x} y2={yIncome} stroke="var(--color-income)" strokeWidth="2" strokeDasharray="4 3" opacity="0.7" />
                  <line x1={(i - 1) * 40 + 20} y1={100 - (trend[i - 1].expense / max) * 80} x2={x} y2={yExpense} stroke="var(--color-expense)" strokeWidth="2" strokeDasharray="4 3" opacity="0.7" />
                </>
              ) : null}
              <circle cx={x} cy={yIncome} r="4" fill="var(--color-income)" />
              <circle cx={x} cy={yExpense} r="4" fill="var(--color-expense)" />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
        <span>{trend[0]?.label}</span>
        <span>{trend[trend.length - 1]?.label}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: 8 }}>
        {t('billsCashFlowHint', { currency })}
      </div>
    </div>
  );
}
