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
  const netPositive = net >= 0;

  const balanceTone = netPositive ? 'positive' : net < 0 ? 'negative' : 'neutral';

  return (
    <div
      className="card card--pressable finance-summary-card"
      style={{ '--expense-ratio': expenseRatio, '--income-ratio': incomeRatio } as CSSProperties}
    >
      <div className="finance-summary-card__glow" aria-hidden data-positive={netPositive ? 'true' : 'false'} />
      <div className="finance-summary-card__inner">
        <div className="finance-summary-card__label">{t('summaryBalance')} · {periodLabel}</div>
        <div className={`finance-summary-card__balance finance-summary-card__balance--${balanceTone}`}>
          <MoneyText
            amount={net}
            currency={currency}
            className="money--hero-display"
          />
        </div>
        <div className="finance-summary-card__chips">
          <StatChip variant="income" label={t('summaryEarned')} value={totalIncome} currency={currency} />
          <StatChip variant="expense" label={t('summarySpent')} value={totalExpenses} currency={currency} />
        </div>
        <div className="finance-summary-card__ratio" aria-hidden>
          <div className="finance-summary-card__ratio-expense" />
          <div className="finance-summary-card__ratio-income" />
        </div>
      </div>
    </div>
  );
}

function StatChip({ variant, label, value, currency }: { variant: 'income' | 'expense'; label: string; value: number; currency: string }) {
  return (
    <div className={`finance-stat-chip finance-stat-chip--${variant}`}>
      <div className="finance-stat-chip__label">
        <span className="finance-stat-chip__indicator" aria-hidden />
        {label}
      </div>
      <MoneyText amount={value} currency={currency} className="money--stat" />
    </div>
  );
}
