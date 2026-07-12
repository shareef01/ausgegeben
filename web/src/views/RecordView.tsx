import { useMemo, useState, memo, type CSSProperties } from 'react';
import { ScreenTitle, EmptyState, LoadingListSkeleton } from '@/components/ui';
import { IconPaperclip, IconSearch, IconArrowUp, IconArrowDown } from '@/components/Icons';
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
import { formatDateLabel, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter, RecordListPeriod } from '@/models/types';
import { colorIntToHex, formatAmount } from '@/utils/currency';
import { isReceiptPath } from '@/services/receiptService';

interface RecordViewProps {
  onEdit: (id: number) => void;
  onAdd?: () => void;
}

export function RecordView({ onEdit, onAdd }: RecordViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, monthSpent, setSearchQuery, setTypeFilter, setListPeriod, requestDelete, duplicateExpense } = useRecordViewModel();
  const periodOptions = recordPeriodOptions();
  const periodLabel = uiState.listPeriod === 'this_month' ? t('recordPeriodThisMonth') : t('recordPeriodAllTime');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of uiState.expenses) {
      const key = dayKey(e.dateMillis);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].map(([, items]) => ({
      label: formatDateLabel(items[0].dateMillis),
      items
    }));
  }, [uiState.expenses]);
  const catMap = useMemo(() => new Map(uiState.categories.map((c) => [c.id!, c])), [uiState.categories]);

  return (
    <div className="record-view page-content">
      <ScreenTitle title={t('screenRecord')} />

      <div className="record-layout">
        <aside className="record-layout__sidebar">
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
        </aside>

        <div className="record-layout__main">
          {uiState.loading ? (
            <LoadingListSkeleton rows={6} />
          ) : uiState.expenses.length === 0 ? (
            <EmptyState
              title={t('recordEmptyTitle')}
              subtitle={t('recordEmptySubtitle')}
              hint={t('recordEmptyHint')}
              action={
                onAdd ? (
                  <button type="button" className="btn btn-primary" onClick={onAdd}>
                    {t('navAdd')}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="transaction-list-bare">
              {grouped.map(({ label, items }) => (
                <section key={label} className="transaction-list-bare__section">
                  <div className="transaction-list-bare__day">{label}</div>
                  <div className="transaction-list-bare__rows">
                  {items.map((expense) => (
                    <SwipeableRow
                      key={expense.id}
                      onDelete={() => void requestDelete(expense.id!)}
                      onTap={() => onEdit(expense.id!)}
                      onLongPress={() => void duplicateExpense(expense)}
                    >
                      <TransactionRow
                        expense={expense}
                        category={catMap.get(expense.categoryId)}
                        currency={currency}
                        onReceiptClick={isReceiptPath(expense.receiptImagePath) ? () => setReceiptPath(expense.receiptImagePath!) : undefined}
                      />
                    </SwipeableRow>
                  ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {receiptPath ? <ReceiptPreview path={receiptPath} onClose={() => setReceiptPath(null)} /> : null}
    </div>
  );
}

const TransactionRow = memo(({ expense, category, currency, onReceiptClick }: {
  expense: Expense;
  category?: Category;
  currency: string;
  onReceiptClick?: () => void;
}) => {
  const { t } = useTranslation();
  const isIncome = expense.transactionType === 'income';
  const isTransfer = expense.transactionType === 'transfer';

  const color = category ? colorIntToHex(category.colorInt) : '#888';
  const amountColor = isIncome
    ? 'var(--color-income)'
    : isTransfer
      ? 'var(--color-transfer)'
      : 'var(--color-on-background)';
  const prefix = isIncome ? '+' : expense.transactionType === 'expense' ? '-' : '';

  const note = expense.note?.trim();
  const categoryName = category?.name || t('recordUnknownCategory');

  return (
    <div className="transaction-row pressable-row">
      <div className="transaction-row__icon-wrap">
        <div className="transaction-row__icon" style={{ '--cat-color': color, background: `color-mix(in srgb, ${color} 10%, transparent)` } as CSSProperties}>
          {category ? (
            <CategoryLucideIcon iconName={category.iconName} width={18} height={18} color={color} />
          ) : (
            <span className="transaction-row__icon-fallback" />
          )}
        </div>
        {!isTransfer && (
          <div className="transaction-row__indicator" style={{ background: isIncome ? 'var(--color-income)' : 'var(--color-expense)' }}>
            {isIncome ? <IconArrowUp width={8} height={8} color="white" /> : <IconArrowDown width={8} height={8} color="white" />}
          </div>
        )}
      </div>
      <div className="transaction-row__meta">
        <div className="transaction-row__title">{categoryName}</div>
        {note && <div className="transaction-row__sub">{note}</div>}
      </div>
      {onReceiptClick ? (
        <button
          type="button"
          aria-label={t('recordViewReceipt')}
          className="transaction-row__receipt"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onReceiptClick(); }}
        >
          <IconPaperclip width={14} height={14} aria-hidden />
        </button>
      ) : null}
      <div className="transaction-row__amount" style={{ color: amountColor }}>
        {prefix}{formatAmount(expense.amount, currency)}
      </div>
    </div>
  );
});

function filterLabel(f: TransactionTypeFilter, t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string): string {
  switch (f) {
    case 'all': return t('filterAll');
    case 'expense': return t('filterExpense');
    case 'income': return t('filterIncome');
    case 'transfer': return t('filterTransfer');
  }
}
