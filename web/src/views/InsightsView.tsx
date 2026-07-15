import { useMemo } from 'react';
import { EmptyState, SignatureText } from '@/components/ui';
import { DonutChart, segmentColor } from '@/components/DonutChart';
import { CashFlowChart, CashFlowLegend } from '@/components/CashFlowChart';
import { AnalyticsPeriodPicker } from '@/components/PeriodSelector';
import { useDashboardViewModel } from '@/viewmodels/useDashboardViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';
import type { Category } from '@/models/types';
import { useHaptics } from '@/hooks/useHaptics';

export function InsightsView() {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, categories, periodOptions, setAnalyticsPeriod } = useDashboardViewModel();
  const haptics = useHaptics();
  const hasData = uiState.totalExpenses > 0 || uiState.totalIncome > 0;

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
        <h1 className="page-title__text text-on-background">
          <SignatureText text={t('screenInsights')} />
        </h1>
      </div>

      <div className="sidebar-layout">

        {/* 2. THE ANALYTICS SIDEBAR (Sticky on Desktop) */}
        <aside className="sidebar-panel">
          <div className="card p-6 bg-glass-elevated border border-surface-border rounded-3xl shadow-xl">
             <div className="section-title mb-4 px-0 opacity-60 uppercase tracking-widest text-[10px] font-black">{t('analysisPeriod')}</div>
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

          {hasData && (
            <div className="flex flex-col gap-6">
               <InsightsStatGrid income={uiState.totalIncome} expense={uiState.totalExpenses} currency={currency} />
            </div>
          )}
        </aside>

        {/* 3. THE MAIN ANALYTICS COLUMN */}
        <div className="content-col">
          {!hasData ? (
            <EmptyState title={t('billsEmptyTitle')} subtitle={t('billsEmptySubtitle')} />
          ) : (
            <div className="flex flex-col gap-12">
               {/* Categories Grid (Responsive) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <CategoryCard title={t('filterExpense')} map={uiState.expensesByCategory} categories={categories} currency={currency} accent="var(--color-expense)" />
                <CategoryCard title={t('filterIncome')} map={uiState.incomeByCategory} categories={categories} currency={currency} accent="var(--color-income)" />
              </div>

              {/* Cash Flow Section */}
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

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-6 bg-glass-elevated border border-surface-border rounded-3xl shadow-lg">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">{t('summarySpent')}</div>
        <div className="text-2xl font-extrabold tabular-nums text-expense">{formatAmount(expense, currency)}</div>
      </div>
      <div className="card p-6 bg-glass-elevated border border-surface-border rounded-3xl shadow-lg">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">{t('summaryEarned')}</div>
        <div className="text-2xl font-extrabold tabular-nums text-income">{formatAmount(income, currency)}</div>
      </div>
      <div className="card p-6 bg-glass-elevated border border-surface-border rounded-3xl shadow-lg">
        <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">{t('billsNet')}</div>
        <div className={`text-2xl font-extrabold tabular-nums ${net >= 0 ? 'text-income' : 'text-expense'}`}>{formatAmount(net, currency)}</div>
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
          <div className="card p-8 bg-glass border border-surface-border rounded-[2rem] opacity-50">
            <div className="text-[10px] font-black uppercase tracking-widest mb-6" style={{ color: accent }}>{title.toLowerCase()}</div>
            <p className="text-center text-xs opacity-50">{t('noDataForPeriod')}</p>
          </div>
      );
  }

  return (
    <div className="card p-8 bg-glass border border-surface-border rounded-[2rem] shadow-2xl">
      <div className="text-[10px] font-black uppercase tracking-widest mb-8" style={{ color: accent }}>{title.toLowerCase()}</div>
      <DonutChart segments={segments} size={200} center={{ value: formatAmount(total, currency) }} />
      <div className="mt-8 space-y-3">
        {entries.slice(0, 4).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === catId);
          const pct = Math.round((amount / total) * 100);
          const dotColor = cat ? segmentColor(cat.colorInt) : 'var(--color-outline)';
          return (
            <div key={catId} className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                <span className="text-sm font-semibold truncate">{cat?.name ?? '?'}</span>
              </div>
              <span className="text-sm font-bold tabular-nums opacity-80">{formatAmount(amount, currency)} · {pct}%</span>
            </div>
          );
        })}
      </div>
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
          <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t('billsCashFlow')}</div>
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
      <div className="flex items-center justify-between mt-6 text-[10px] font-black uppercase tracking-widest opacity-30">
        <span>{trend[0]?.label}</span>
        <span>{trend[trend.length - 1]?.label}</span>
      </div>
    </div>
  );
}
