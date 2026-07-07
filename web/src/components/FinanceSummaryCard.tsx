import { type CSSProperties } from 'react';
import { MoneyText } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { IconArrowUp, IconArrowDown } from '@/components/Icons';

interface FinanceSummaryCardProps {
  totalExpenses: number;
  totalIncome: number;
  currency: string;
  periodLabel: string;
}

export function FinanceSummaryCard({ totalExpenses, totalIncome, currency, periodLabel }: FinanceSummaryCardProps) {
  const { t } = useTranslation();
  const net = totalIncome - totalExpenses;
  const total = totalExpenses + totalIncome;
  const incomeRatio = total > 0 ? totalIncome / total : 0.5;
  const expenseRatio = total > 0 ? totalExpenses / total : 0.5;
  const netPositive = net >= 0;

  const balanceTone = netPositive ? 'positive' : net < 0 ? 'negative' : 'neutral';

  const heroStyles = {
    '--hero-balance-gradient': netPositive
      ? 'linear-gradient(180deg, #6EE7B7 0%, #10B981 100%)'
      : 'linear-gradient(180deg, #FDA4AF 0%, #FB7185 100%)',
    '--hero-balance-glow': netPositive
      ? 'rgba(16, 185, 129, 0.25)'
      : 'rgba(251, 113, 133, 0.25)'
  } as CSSProperties;

  return (
    <div
      className="card finance-summary-card card--elevated finance-summary-card--animate insights-glass-island"
      role="region"
      aria-label={`${t('summaryBalance')} · ${periodLabel}`}
      style={{ '--expense-ratio': expenseRatio, '--income-ratio': incomeRatio } as CSSProperties}
    >
      <div className="finance-summary-card__inner">
        <div className="finance-summary-card__label">{t('summaryBalance')} · {periodLabel}</div>
        <div className={`finance-summary-card__balance finance-summary-card__balance--${balanceTone}`}>
          <MoneyText
            amount={net}
            currency={currency}
            className="money--hero-display"
            style={heroStyles}
            animateChanges
          />
        </div>
        <div className="finance-summary-card__chips finance-summary-card__panes">
          <StatChip variant="income" label={t('summaryEarned')} value={totalIncome} currency={currency} muted={totalIncome === 0} />
          <div className="finance-summary-card__pane-divider" aria-hidden />
          <StatChip variant="expense" label={t('summarySpent')} value={totalExpenses} currency={currency} muted={totalExpenses === 0} />
        </div>
      </div>
    </div>
  );
}

function StatChip({ variant, label, value, currency, muted }: { variant: 'income' | 'expense'; label: string; value: number; currency: string; muted?: boolean }) {
  const isIncome = variant === 'income';
  const color = isIncome ? 'var(--color-income)' : 'var(--color-expense)';

  return (
    <div
      className={`finance-stat-chip finance-stat-chip--${variant}${muted ? ' finance-stat-chip--muted' : ''}`}
      style={{ '--badge-color': color } as CSSProperties}
    >
      <div className="finance-stat-chip__icon-badge" aria-hidden>
        {isIncome ? <IconArrowUp width={14} height={14} /> : <IconArrowDown width={14} height={14} />}
      </div>

      <div className="finance-stat-chip__label">
        {label}
      </div>
      <MoneyText amount={value} currency={currency} className="money--stat" animateChanges />
      <div className="finance-stat-chip__underline-wrap" aria-hidden>
        <div className="finance-stat-chip__underline" style={{ background: color }} />
      </div>
    </div>
  );
}
