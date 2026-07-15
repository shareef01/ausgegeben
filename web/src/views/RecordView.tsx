import { useMemo, useState, memo, useCallback } from 'react';
import { EmptyState, LoadingListSkeleton, SignatureText } from '@/components/ui';
import { IconPaperclip, IconSearch, IconClose, IconArrowUp, IconArrowDown } from '@/components/Icons';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { recordPeriodOptions, PremiumPeriodSelector } from '@/components/PeriodSelector';
import { SwipeableRow } from '@/components/SwipeableRow';
import { ReceiptPreview } from '@/components/ReceiptPreview';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useRecordViewModel } from '@/viewmodels/useRecordViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatDateLabel, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter } from '@/models/types';
import { formatAmount } from '@/utils/currency';
import { isReceiptPath } from '@/services/receiptService';
import { useHaptics } from '@/hooks/useHaptics';

interface RecordViewProps {
  onEdit: (id: string) => void;
  onAdd?: () => void;
}

export function RecordView({ onEdit, onAdd }: RecordViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const { uiState, monthSpent, viewingCurrentMonth, setSearchQuery, setTypeFilter, setListPeriod, requestDelete, duplicateExpense } = useRecordViewModel();
  const haptics = useHaptics();
  const periodOptions = useMemo(() => recordPeriodOptions(locale, t), [locale, t]);
  const selectedPeriod = useMemo(
    () => periodOptions.find((o) => o.key === uiState.listPeriod) ?? periodOptions[0],
    [periodOptions, uiState.listPeriod],
  );
  const periodLabel = selectedPeriod.label;
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const hasQuery = uiState.searchQuery.length > 0;

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

  const catMap = useMemo(() => new Map(uiState.categories.map((c) => [c.id, c])), [uiState.categories]);

  // SECURE: Prop stability for React.memo children
  const handleDelete = useCallback((id: string) => {
      setDeleteConfirmId(id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    haptics.heavy();
    void requestDelete(deleteConfirmId);
    setDeleteConfirmId(null);
  }, [deleteConfirmId, requestDelete, haptics]);

  const cancelDelete = useCallback(() => setDeleteConfirmId(null), []);

  const handleEdit = useCallback((id: string) => {
      haptics.light();
      onEdit(id);
  }, [onEdit, haptics]);

  const handleDuplicate = useCallback((e: Expense) => {
      haptics.medium();
      void duplicateExpense(e);
  }, [duplicateExpense, haptics]);

  return (
    <>
      <div className="page-title">
        <h1 className="page-title__text font-bold text-on-background tracking-wide">
          <SignatureText text={t('screenRecord')} />
        </h1>
      </div>

      <div className="sidebar-layout">

        <aside className="sidebar-panel">
          <div className="widget-stack">
            <FinanceSummaryCard expenses={uiState.expenses} currency={currency} periodLabel={periodLabel} />

            {uiState.monthlyBudget && viewingCurrentMonth ? (
              <BudgetProgressBar spent={monthSpent} budget={uiState.monthlyBudget} currency={currency} />
            ) : null}
          </div>

          <div className="card record-filters flex flex-col p-5">
            <PremiumPeriodSelector
              options={periodOptions}
              selected={selectedPeriod}
              labelFor={(o) => o.label}
              isSelected={(a, b) => a.key === b.key}
              onSelected={(o) => setListPeriod(o.key)}
            />

            <hr className="record-filters__divider" />

            <div className={`record-search relative ${searchFocused ? 'record-search--focused' : ''}`}>
              <IconSearch
                className="record-search__icon"
                width={17} height={17} aria-hidden
              />
              <input
                className="record-search__input"
                placeholder={t('recordSearchPlaceholder')}
                value={uiState.searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              {hasQuery && (
                <button
                  type="button"
                  className="record-search__clear"
                  aria-label={t('recordSearchClear')}
                  onClick={() => setSearchQuery('')}
                >
                  <IconClose width={14} height={14} aria-hidden />
                </button>
              )}
            </div>

            <hr className="record-filters__divider" />

            <IosSegmentedControl
              className="record-type-segmented w-full"
              options={(['all', 'expense', 'income', 'transfer'] as TransactionTypeFilter[]).map((f) => ({
                value: f,
                label: filterLabel(f, t),
              }))}
              value={uiState.typeFilter}
              onChange={setTypeFilter}
            />
          </div>
        </aside>

        <div className="content-col">
          {uiState.loading ? (
            <LoadingListSkeleton rows={12} />
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
            <div className="transaction-list-bare txn-sections">
              {grouped.map(({ label, items }) => (
                <section key={label} className="transaction-list-bare__section">
                  <div className="txn-day-header">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500">{label}</span>
                  </div>
                   <div className="flex flex-col">
                  {items.map((expense, idx) => (
                    <div key={expense.id} className="flex items-center justify-between py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors tab-panel--animate-in" style={{ animationDelay: `${idx * 20}ms` }}>
                      <SwipeableRow
                        onDelete={() => handleDelete(expense.id)}
                        onTap={() => handleEdit(expense.id)}
                        onLongPress={() => handleDuplicate(expense)}
                      >
                        <TransactionRow
                          expense={expense}
                          category={catMap.get(expense.categoryId)}
                          currency={currency}
                          onReceiptClick={isReceiptPath(expense.receiptImagePath) ? () => setReceiptPath(expense.receiptImagePath!) : undefined}
                        />
                      </SwipeableRow>
                    </div>
                  ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

      </div>

      {receiptPath ? <ReceiptPreview path={receiptPath} onClose={() => setReceiptPath(null)} /> : null}

      <ConfirmDialog
        open={deleteConfirmId !== null}
        title={t('recordDeleteTitle')}
        message={t('recordDeleteConfirm')}
        confirmLabel={t('actionDelete')}
        cancelLabel={t('actionCancel')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
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

  const amountColor = isIncome
    ? 'var(--color-income)'
    : isTransfer
      ? 'var(--color-transfer)'
      : 'var(--color-on-background)';
  const prefix = isIncome ? '+' : expense.transactionType === 'expense' ? '-' : '';

  const note = expense.note?.trim();
  const categoryName = category?.name || t('recordUnknownCategory');

  return (
    <div className="flex items-center gap-4 w-full">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white/5">
        {category ? (
          <CategoryLucideIcon iconName={category.iconName} className="w-5 h-5 text-zinc-300" />
        ) : (
          <span className="w-5 h-5 bg-zinc-700 rounded-full" />
        )}
        {!isTransfer && (
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-[#0C0C0E] border-2 border-[#0C0C0E]">
            {isIncome ? (
              <IconArrowUp width={8} height={8} className="text-emerald-500" />
            ) : (
              <IconArrowDown width={8} height={8} className="text-rose-500" />
            )}
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
