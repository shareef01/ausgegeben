import { useMemo, useState, type CSSProperties } from 'react';
import { ScreenTitle, EmptyState, LoadingListSkeleton } from '@/components/ui';
import { IconAdd, IconSearch } from '@/components/Icons';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { recordPeriodOptions } from '@/components/PeriodSelector';
import { SwipeableRow } from '@/components/SwipeableRow';
import { ReceiptPreview } from '@/components/ReceiptPreview';
import { useRecordViewModel } from '@/viewmodels/useRecordViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatDateLabel, formatRelativeTimestamp, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter, RecordListPeriod } from '@/models/types';
import { colorIntToHex, formatAmount } from '@/utils/currency';
import { isReceiptPath } from '@/services/receiptService';

interface RecordViewProps {
  onAdd: () => void;
  onEdit: (id: number) => void;
}

function AddTransactionPill({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={`btn btn-primary add-transaction-pill ${className}`.trim()} onClick={onClick}>
      <IconAdd width={18} height={18} strokeWidth={2.5} aria-hidden />
      <span>{t('navAdd')}</span>
    </button>
  );
}

export function RecordView({ onAdd, onEdit }: RecordViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, monthSpent, setSearchQuery, setTypeFilter, setListPeriod, requestDelete, duplicateExpense } = useRecordViewModel();
  const periodOptions = recordPeriodOptions();
  const periodLabel = uiState.listPeriod === 'this_month' ? t('recordPeriodThisMonth') : t('recordPeriodAllTime');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const grouped = useMemo(() => groupByDay(uiState.expenses), [uiState.expenses]);
  const catMap = useMemo(() => new Map(uiState.categories.map((c) => [c.id!, c])), [uiState.categories]);

  const addAction = <AddTransactionPill onClick={onAdd} />;

  return (
    <div className="record-view page-content">
      <ScreenTitle title={t('screenRecord')} action={addAction} />

      <FinanceSummaryCard expenses={uiState.expenses} currency={currency} periodLabel={periodLabel} />

      {uiState.monthlyBudget ? (
        <BudgetProgressBar spent={monthSpent} budget={uiState.monthlyBudget} currency={currency} />
      ) : null}

      <div className="card record-filters">
        <div className="record-toolbar">
          <IosSegmentedControl
            className="record-period-segmented"
            options={periodOptions.map((p) => ({ value: p.key, label: p.label }))}
            value={uiState.listPeriod}
            onChange={(key) => setListPeriod(key as RecordListPeriod)}
          />
          <div className="record-search">
            <IconSearch className="record-search__icon" width={18} height={18} aria-hidden />
            <input
              className="search-input record-search__input"
              placeholder={t('recordSearchPlaceholder')}
              value={uiState.searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <IosSegmentedControl
          className="record-type-segmented"
          options={(['all', 'expense', 'income', 'transfer'] as TransactionTypeFilter[]).map((f) => ({
            value: f,
            label: filterLabel(f, t),
          }))}
          value={uiState.typeFilter}
          onChange={setTypeFilter}
        />
      </div>

      {uiState.loading ? (
        <LoadingListSkeleton rows={6} />
      ) : uiState.expenses.length === 0 ? (
        <EmptyState
          title={t('recordEmptyTitle')}
          subtitle={`${t('recordEmptySubtitle')} ${t('recordEmptyHint')}`}
        />
      ) : (
        <div className="card card--pressable transaction-list-card">
          {grouped.map(([label, items]) => (
            <section key={label}>
              <div className="transaction-list-card__day">{label}</div>
              {items.map((expense) => (
                <SwipeableRow
                  key={expense.id}
                  onDelete={() => void requestDelete(expense.id!)}
                  onLongPress={() => void duplicateExpense(expense)}
                >
                  <TransactionRow
                    expense={expense}
                    category={catMap.get(expense.categoryId)}
                    currency={currency}
                    onClick={() => onEdit(expense.id!)}
                    onReceiptClick={isReceiptPath(expense.receiptImagePath) ? () => setReceiptPath(expense.receiptImagePath!) : undefined}
                  />
                </SwipeableRow>
              ))}
            </section>
          ))}
        </div>
      )}

      {receiptPath ? <ReceiptPreview path={receiptPath} onClose={() => setReceiptPath(null)} /> : null}
    </div>
  );
}

function TransactionRow({ expense, category, currency, onClick, onReceiptClick }: {
  expense: Expense;
  category?: Category;
  currency: string;
  onClick: () => void;
  onReceiptClick?: () => void;
}) {
  const { t } = useTranslation();
  const color = category ? colorIntToHex(category.colorInt) : '#888';
  const amountColor = expense.transactionType === 'income'
    ? 'var(--color-income)'
    : expense.transactionType === 'transfer'
      ? 'var(--color-transfer)'
      : 'var(--color-expense)';
  const prefix = expense.transactionType === 'income' ? '+' : expense.transactionType === 'expense' ? '-' : '';

  const note = expense.note?.trim();
  const primaryTitle = note || category?.name || t('transactionDefault');
  const relativeTime = formatRelativeTimestamp(expense.dateMillis);
  const subLabel = note && category?.name ? `${category.name} · ${relativeTime}` : relativeTime;

  return (
    <div className="transaction-row pressable-row" onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} role="button" tabIndex={0}>
      <div className="transaction-row__icon" style={{ '--cat-color': color } as CSSProperties}>
        {category ? (
          <CategoryLucideIcon iconName={category.iconName} width={20} height={20} color={color} />
        ) : (
          <span className="transaction-row__icon-fallback" />
        )}
      </div>
      <div className="transaction-row__meta">
        <div className="transaction-row__title">{primaryTitle}</div>
        <div className="transaction-row__sub">{subLabel}</div>
      </div>
      {onReceiptClick ? (
        <button type="button" aria-label={t('recordViewReceipt')} className="transaction-row__receipt" onClick={(e) => { e.stopPropagation(); onReceiptClick(); }}>📎</button>
      ) : null}
      <div className="transaction-row__amount" style={{ color: amountColor }}>
        {prefix}{formatAmount(expense.amount, currency)}
      </div>
    </div>
  );
}

function groupByDay(expenses: Expense[]): [string, Expense[]][] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = dayKey(e.dateMillis);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()].map(([, items]) => [formatDateLabel(items[0].dateMillis), items]);
}

function filterLabel(f: TransactionTypeFilter, t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string): string {
  switch (f) {
    case 'all': return t('filterAll');
    case 'expense': return t('filterExpense');
    case 'income': return t('filterIncome');
    case 'transfer': return t('filterTransfer');
  }
}
