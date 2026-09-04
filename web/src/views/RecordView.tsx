import { useMemo, useState, memo, useCallback } from 'react';
import { EmptyState, LoadingListSkeleton, PageTitle, CategoryIconTile } from '@/components/ui';
import { IconSearch, IconClose, IconArrowUp, IconArrowDown, IconTransfer, IconRecord } from '@/components/Icons';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { recordPeriodOptions, PremiumPeriodSelector } from '@/components/PeriodSelector';
import { SwipeableRow } from '@/components/SwipeableRow';
import { useRecordViewModel } from '@/viewmodels/useRecordViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation, type Locale } from '@/i18n';
import { formatDateLabel, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter } from '@/models/types';
import { formatAmount, colorIntToHex } from '@/utils/currency';
import { useHaptics } from '@/hooks/useHaptics';

interface RecordViewProps {
  onEdit: (id: string) => void;
  onAdd?: () => void;
}

export function RecordView({ onEdit, onAdd }: RecordViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const { uiState, monthSpent, viewingCurrentMonth, setSearchQuery, setTypeFilter, setListPeriod, requestDelete, duplicateExpense, reload } = useRecordViewModel();
  const haptics = useHaptics();
  const periodOptions = useMemo(() => recordPeriodOptions(locale, t), [locale, t]);
  const selectedPeriod = useMemo(
    () => periodOptions.find((o) => o.key === uiState.listPeriod) ?? periodOptions[0],
    [periodOptions, uiState.listPeriod],
  );
  const periodLabel = selectedPeriod.label;
  const [searchFocused, setSearchFocused] = useState(false);
  const hasQuery = uiState.searchQuery.length > 0;
  const filtersActive = hasQuery || uiState.typeFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('all');
  }, [setSearchQuery, setTypeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of uiState.expenses) {
      const key = dayKey(e.dateMillis);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].map(([key, items]) => {
      const [dayIncome, dayExpense] = uiState.dayTotalsByLabel[key] ?? [0, 0];
      return {
        label: formatDateLabel(items[0].dateMillis, locale),
        items,
        dayIncome,
        dayExpense,
      };
    });
    // Period day totals stay unfiltered (Android parity); list rows stay search/type-filtered.
  }, [uiState.expenses, uiState.dayTotalsByLabel, locale]);

  const catMap = useMemo(() => new Map(uiState.categories.map((c) => [c.id, c])), [uiState.categories]);

  // SECURE: Prop stability for React.memo children
  const handleDelete = useCallback((id: string) => {
    haptics.heavy();
    void requestDelete(id);
  }, [requestDelete, haptics]);

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
      <PageTitle text={t('screenRecord')} icon={IconRecord} />

      <div className="sidebar-layout">

        <aside className="sidebar-panel">
          <div className="widget-stack">
            <FinanceSummaryCard expenses={uiState.summaryExpenses} currency={currency} periodLabel={periodLabel} />

            {uiState.monthlyBudget && viewingCurrentMonth ? (
              <BudgetProgressBar spent={monthSpent} budget={uiState.monthlyBudget} currency={currency} />
            ) : null}

            {uiState.topExpenseCategoryName ? (
              <p className="record-most-spent" role="status">
                {t('recordMostSpentOn', { name: uiState.topExpenseCategoryName })}
              </p>
            ) : null}
          </div>

          <div className="card record-filters">
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
                width={18} height={18} aria-hidden
              />
              <input
                className="record-search__input"
                type="search"
                placeholder={t('recordSearchPlaceholder')}
                aria-label={t('recordSearchPlaceholder')}
                value={uiState.searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                autoComplete="off"
                spellCheck={false}
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
              aria-label={t('recordTypeFilter')}
              options={([
                { value: 'all' as const, icon: <IconRecord width={18} height={18} aria-hidden /> },
                { value: 'expense' as const, icon: <IconArrowDown width={18} height={18} strokeWidth={2.5} aria-hidden /> },
                { value: 'income' as const, icon: <IconArrowUp width={18} height={18} strokeWidth={2.5} aria-hidden /> },
                { value: 'transfer' as const, icon: <IconTransfer width={18} height={18} aria-hidden /> },
              ]).map((opt) => ({
                ...opt,
                label: filterLabel(opt.value, t),
              }))}
              value={uiState.typeFilter}
              onChange={setTypeFilter}
            />
          </div>
        </aside>

        <div className="content-col">
          {uiState.loading ? (
            <LoadingListSkeleton rows={12} />
          ) : uiState.expenses.length === 0 && uiState.loadError ? (
            <EmptyState
              title={t('errorLoadFailed')}
              subtitle={t('errorLoadFailedHint')}
              action={
                <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                  {t('actionRetry')}
                </button>
              }
            />
          ) : (
            <>
              {uiState.loadError ? (
                <div className="settings-sync-error" role="alert">
                  <p className="settings-sync-error__text">{t('errorLoadFailed')}</p>
                  <button
                    type="button"
                    className="settings-sync-error__retry"
                    onClick={() => void reload()}
                  >
                    {t('actionRetry')}
                  </button>
                </div>
              ) : null}
              {uiState.dataTruncated ? (
                <p className="data-truncated-notice" role="status">
                  {t('dataTruncatedNotice')}
                </p>
              ) : null}
              {uiState.expenses.length === 0 ? (
            filtersActive ? (
              <EmptyState
                title={t('recordNoMatchesTitle')}
                subtitle={t('recordNoMatchesSubtitle')}
                action={
                  <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                    {t('recordClearFilters')}
                  </button>
                }
              />
            ) : (
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
            )
          ) : (
            <div className="transaction-list-bare txn-sections">
              {grouped.map(({ label, items, dayIncome, dayExpense }) => (
                <section key={label} className="transaction-list-bare__section">
                  <div className="txn-day-header transaction-list-bare__day">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">{label}</span>
                    {(dayIncome > 0 || dayExpense > 0) ? (
                      <span className="txn-day-header__totals" aria-label={`${t('filterIncome')} ${formatAmount(dayIncome, currency)}, ${t('filterExpense')} ${formatAmount(dayExpense, currency)}`}>
                        {dayIncome > 0 ? (
                          <span className="txn-day-header__total--income">+{formatAmount(dayIncome, currency)}</span>
                        ) : null}
                        {dayExpense > 0 ? (
                          <span className="txn-day-header__total--expense">−{formatAmount(dayExpense, currency)}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                   <div className="transaction-list-bare__rows flex flex-col">
                  {items.map((expense) => (
                    <div key={expense.id} className="txn-row-wrap">
                      <SwipeableRow
                        onDelete={() => handleDelete(expense.id)}
                        onTap={() => handleEdit(expense.id)}
                        onLongPress={() => handleDuplicate(expense)}
                        onDuplicate={() => handleDuplicate(expense)}
                        ariaLabel={recordRowAriaLabel(expense, catMap.get(expense.categoryId), currency, locale, t)}
                      >
                        <TransactionRow
                          expense={expense}
                          category={catMap.get(expense.categoryId)}
                          currency={currency}
                        />
                      </SwipeableRow>
                    </div>
                  ))}
                  </div>
                </section>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const TransactionRow = memo(({ expense, category, currency }: {
  expense: Expense;
  category?: Category;
  currency: string;
}) => {
  const { t } = useTranslation();
  const isIncome = expense.transactionType === 'income';
  const isTransfer = expense.transactionType === 'transfer';

  const amountMod = isIncome
    ? 'transaction-row__amount--income'
    : isTransfer
      ? 'transaction-row__amount--transfer'
      : 'transaction-row__amount--expense';
  const prefix = isIncome ? '+' : expense.transactionType === 'expense' ? '-' : '';

  const note = expense.note?.trim();
  const categoryName = category?.name || t('recordUnknownCategory');

  return (
    <div className="transaction-row flex items-center gap-3 w-full min-w-0 py-3">
      <div className="transaction-row__icon relative shrink-0">
        {category ? (
          <CategoryIconTile iconName={category.iconName} color={colorIntToHex(category.colorInt)} size={40} />
        ) : (
          <span className="transaction-row__icon-fallback" aria-hidden>
            <span className="transaction-row__icon-fallback-dot" />
          </span>
        )}
        <span
          className={`transaction-row__type-badge ${
            isTransfer
              ? 'transaction-row__type-badge--transfer'
              : isIncome
                ? 'transaction-row__type-badge--income'
                : 'transaction-row__type-badge--expense'
          }`}
          aria-hidden
        >
          {isTransfer ? (
            <IconTransfer width={11} height={11} strokeWidth={2.5} />
          ) : isIncome ? (
            <IconArrowUp width={11} height={11} strokeWidth={2.75} />
          ) : (
            <IconArrowDown width={11} height={11} strokeWidth={2.75} />
          )}
        </span>
      </div>

      <div className="transaction-row__meta">
        <div className="transaction-row__title">{categoryName}</div>
        {note && <div className="transaction-row__sub">{note}</div>}
      </div>

      <div className={`transaction-row__amount ${amountMod}`}>
        {prefix}{formatAmount(expense.amount, currency)}
      </div>
    </div>
  );
});

function recordRowAriaLabel(
  expense: Expense,
  category: Category | undefined,
  currency: string,
  locale: Locale,
  t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string,
): string {
  const categoryName = category?.name || t('recordUnknownCategory');
  const formatted = formatAmount(expense.amount, currency, true, locale);
  const amount =
    expense.transactionType === 'income'
      ? `+${formatted}`
      : expense.transactionType === 'expense'
        ? `−${formatted}`
        : formatted;
  const note = expense.note?.trim() ?? '';
  const key =
    expense.transactionType === 'income'
      ? 'descIncomeRow'
      : expense.transactionType === 'transfer'
        ? 'descTransferRow'
        : 'descExpenseRow';
  return t(key, { category: categoryName, amount, note });
}

function filterLabel(f: TransactionTypeFilter, t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string): string {
  switch (f) {
    case 'all': return t('filterAll');
    case 'expense': return t('filterExpense');
    case 'income': return t('filterIncome');
    case 'transfer': return t('filterTransfer');
  }
}
