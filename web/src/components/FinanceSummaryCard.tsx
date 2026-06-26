import { computeTotals } from '@/utils/analytics';
import type { Expense } from '@/models/types';
import { MoneyText } from '@/components/ui';
import { useTranslation } from '@/i18n';

interface FinanceSummaryCardProps {
  expenses: Expense[];
  currency: string;
  periodLabel: string;
}

export function FinanceSummaryCard({ expenses, currency, periodLabel }: FinanceSummaryCardProps) {
  const { t } = useTranslation();
  const { totalExpenses, totalIncome, net } = computeTotals(expenses);
  const incomeRatio = totalExpenses + totalIncome > 0 ? totalIncome / (totalExpenses + totalIncome) : 0.5;
  const netColor = net > 0 ? 'var(--color-income)' : net < 0 ? 'var(--color-expense)' : 'var(--color-on-background)';

  return (
    <div
      className="card"
      style={{
        margin: '0 16px 12px',
        padding: 16,
        background: `linear-gradient(135deg, color-mix(in srgb, var(--color-income) 8%, var(--color-surface)), var(--color-surface), color-mix(in srgb, var(--color-expense) 6%, var(--color-surface)))`,
      }}
    >
      <div style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{t('summaryBalance')} · {periodLabel}</div>
      <div style={{ fontSize: '2rem', fontWeight: 600, color: netColor, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
        <MoneyText amount={net} currency={currency} className="money--hero" color={netColor} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <StatChip label={t('summaryEarned')} value={totalIncome} color="var(--color-income)" currency={currency} />
        <StatChip label={t('summarySpent')} value={totalExpenses} color="var(--color-expense)" currency={currency} />
      </div>
      <div style={{ marginTop: 16, height: 5, borderRadius: 999, background: 'color-mix(in srgb, var(--color-on-surface) 6%, transparent)', display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1 - incomeRatio, background: 'var(--color-expense)', opacity: 0.85, borderRadius: 999 }} />
        <div style={{ flex: incomeRatio, background: 'var(--color-income)', opacity: 0.9, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function StatChip({ label, value, color, currency }: { label: string; value: number; color: string; currency: string }) {
  return (
    <div style={{ flex: 1, padding: '8px 12px', borderRadius: 12, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{label}</div>
      <MoneyText amount={value} currency={currency} color={color} />
    </div>
  );
}
