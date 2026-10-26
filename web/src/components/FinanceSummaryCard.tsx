import { computeTotals } from '@/utils/analytics';
import type { Expense } from '@/models/types';
import { MoneyText } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { IconArrowUp, IconArrowDown, IconTransfer } from '@/components/Icons';
import { formatAmount } from '@/utils/currency';

interface FinanceSummaryCardProps {
  expenses: Expense[];
  currency: string;
  periodLabel: string;
}

export function FinanceSummaryCard({ expenses, currency, periodLabel }: FinanceSummaryCardProps) {
  const { t } = useTranslation();
  const { totalExpenses, totalIncome, totalTransfers, transferCount, net } = computeTotals(expenses);
  const tone = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral';

  return (
    <div className="finance-summary-card card--pro">
      <div className="finance-summary-card__eyebrow">
        {t('summaryBalance')} · {periodLabel}
      </div>
      <MoneyText
        amount={net}
        currency={currency}
        className={`finance-summary-card__balance finance-summary-card__balance--${tone}`}
      />
      <div className="finance-summary-card__stats">
        <StatChip variant="income" label={t('summaryEarned')} value={totalIncome} currency={currency} />
        <StatChip variant="expense" label={t('summarySpent')} value={totalExpenses} currency={currency} />
        {/* Transfers are neither income nor expense, so `net` above excludes them. Showing the
            total whenever it is non-zero is what makes that number explainable instead of
            looking like it silently dropped rows (UX-2 follow-up). */}
        {totalTransfers > 0 ? (
          <StatChip
            variant="transfer"
            label={t('summaryTransferred')}
            value={totalTransfers}
            currency={currency}
            ariaLabel={`${t('summaryTransferred')}: ${formatAmount(totalTransfers, currency)}, ${t('summaryTransferredCount', { count: String(transferCount) })}`}
          />
        ) : null}
      </div>
    </div>
  );
}

function StatChip({
  variant,
  label,
  value,
  currency,
  ariaLabel,
}: {
  variant: 'income' | 'expense' | 'transfer';
  label: string;
  value: number;
  currency: string;
  ariaLabel?: string;
}) {
  const isIncome = variant === 'income';

  return (
    <div className={`finance-stat-chip finance-stat-chip--${variant}`} aria-label={ariaLabel}>
      <span className="finance-stat-chip__icon" aria-hidden>
        {isIncome ? (
          <IconArrowUp width={14} height={14} strokeWidth={2.75} />
        ) : variant === 'transfer' ? (
          <IconTransfer width={14} height={14} strokeWidth={2.75} />
        ) : (
          <IconArrowDown width={14} height={14} strokeWidth={2.75} />
        )}
      </span>
      <div className="finance-stat-chip__copy">
        <div className="finance-stat-chip__label">{label}</div>
        <MoneyText amount={value} currency={currency} className="finance-stat-chip__value" />
      </div>
    </div>
  );
}
