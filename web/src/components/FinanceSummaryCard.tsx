import { computeTotals } from '@/utils/analytics';
import type { CSSProperties } from 'react';
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
  const total = totalExpenses + totalIncome;
  const incomeRatio = total > 0 ? totalIncome / total : 0.5;
  const expenseRatio = total > 0 ? totalExpenses / total : 0.5;
  const netColor = net > 0 ? 'var(--color-income)' : net < 0 ? 'var(--color-expense)' : 'var(--color-on-background)';

  return (
    <div
      className="card card--pressable finance-summary-card"
      style={{ '--expense-ratio': expenseRatio, '--income-ratio': incomeRatio } as CSSProperties}
    >
      <div className="finance-summary-card__label">{t('summaryBalance')} · {periodLabel}</div>
      <div className="finance-summary-card__balance">
        <MoneyText amount={net} currency={currency} className="money--hero-display" color={netColor} />
      </div>
      <div className="finance-summary-card__chips">
        <StatChip label={t('summaryEarned')} value={totalIncome} chipColor="var(--color-income)" currency={currency} />
        <StatChip label={t('summarySpent')} value={totalExpenses} chipColor="var(--color-expense)" currency={currency} />
      </div>
      <div className="finance-summary-card__ratio" aria-hidden>
        <div className="finance-summary-card__ratio-expense" />
        <div className="finance-summary-card__ratio-income" />
      </div>
    </div>
  );
}

function StatChip({ label, value, chipColor, currency }: { label: string; value: number; chipColor: string; currency: string }) {
  return (
    <div className="finance-stat-chip" style={{ '--chip-color': chipColor } as CSSProperties}>
      <div className="finance-stat-chip__label">{label}</div>
      <MoneyText amount={value} currency={currency} className="money--stat" color={chipColor} />
    </div>
  );
}
