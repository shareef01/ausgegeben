import { useEffect, useMemo, useRef, useState, memo, type CSSProperties, type ReactNode } from 'react';
import { ScreenTitle, EmptyState, LoadingGlassSpinner, LoadingListSkeleton } from '@/components/ui';
import { IconPaperclip, IconSearch, IconArrowUp, IconArrowDown, IconClose, IconInsights, IconArrowLeftRight, IconRecord, IconCloudOff, IconAdd } from '@/components/Icons';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { recordPeriodOptions } from '@/components/PeriodSelector';
import { SwipeableRow } from '@/components/SwipeableRow';
import { ReceiptPreview } from '@/components/ReceiptPreview';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PullToRefreshSurface } from '@/components/PullToRefreshSurface';
import { CloudSyncButton } from '@/components/CloudSyncButton';
import { AddTransactionButton } from '@/components/AddTransactionButton';
import { useRecordViewModel } from '@/viewmodels/useRecordViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { isCloudSyncActive } from '@/services/cloudSync';
import { useTranslation } from '@/i18n';
import { formatDateLabel, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter, RecordListPeriod } from '@/models/types';
import { colorIntToHex, formatAmount } from '@/utils/currency';
import { contrastColorOn, readCssColor } from '@/theme/tokens';
import { isReceiptPath } from '@/services/receiptService';

interface RecordViewProps {
  onEdit: (id: number) => void;
  onAdd?: () => void;
  onAddLongPress?: () => void;
}

export function RecordView({ onEdit, onAdd, onAddLongPress }: RecordViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const { uiState, monthSpent, setSearchQuery, setTypeFilter, setListPeriod, requestDelete, duplicateExpense, loadMore, reload, refreshFromCloud, refreshing } = useRecordViewModel();
  const cloudSync = isCloudSyncActive();
  const pullLabel = refreshing ? t('syncInProgress') : t('recordPullToSync');
  const periodOptions = recordPeriodOptions();
  const periodLabel = uiState.listPeriod === 'this_month' ? t('recordPeriodThisMonth') : t('recordPeriodAllTime');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (deleteTargetId == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTargetId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTargetId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of uiState.displayExpenses) {
      const key = dayKey(e.dateMillis);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].map(([, items]) => ({
      label: formatDateLabel(items[0].dateMillis),
      items
    }));
  }, [uiState.displayExpenses]);
  const catMap = useMemo(() => new Map(uiState.categories.map((c) => [c.id!, c])), [uiState.categories]);

  const addButton = (className: string, label: ReactNode) =>
    onAdd ? (
      <AddTransactionButton
        className={className}
        onAdd={onAdd}
        onLongPress={onAddLongPress}
      >
        {label}
      </AddTransactionButton>
    ) : null;

  const screenActions = (includeAdd = true) => (
    <div className="record-screen-actions">
      {cloudSync ? (
        <CloudSyncButton refreshing={refreshing} onRefresh={() => void refreshFromCloud()} />
      ) : null}
      {includeAdd && onAdd ? addButton('btn btn-primary record-add-btn', t('addTransaction')) : null}
    </div>
  );

  if (uiState.loading) {
    return (
      <PullToRefreshSurface
        enabled={cloudSync}
        refreshing={refreshing}
        onRefresh={() => void refreshFromCloud()}
        label={pullLabel}
      >
      <div className="record-view page-content">
        <ScreenTitle
          title={t('screenRecord')}
          action={screenActions()}
        />
        <div className="record-view__workspace">
          <div className="record-view__sidebar">
            <div className="record-loading-stack__summary skeleton insights-glass-island" aria-hidden />
            {onAdd ? addButton('btn btn-primary record-sidebar-add-btn', (
              <>
                <IconAdd width={18} height={18} aria-hidden />
                {t('addTransaction')}
              </>
            )) : null}
          </div>
          <div className="record-view__main">
            <LoadingListSkeleton rows={8} />
          </div>
        </div>
      </div>
      </PullToRefreshSurface>
    );
  }

  return (
    <PullToRefreshSurface
      enabled={cloudSync}
      refreshing={refreshing}
      onRefresh={() => void refreshFromCloud()}
      label={pullLabel}
    >
    <div className="record-view page-content">
      <ScreenTitle
        title={t('screenRecord')}
        action={screenActions()}
      />

      <div className="record-view__workspace">
        <div className="record-view__sidebar">
          <FinanceSummaryCard
            totalExpenses={uiState.summaryTotals.totalExpenses}
            totalIncome={uiState.summaryTotals.totalIncome}
            currency={currency}
            periodLabel={periodLabel}
          />

          {uiState.monthlyBudget ? (
            <BudgetProgressBar spent={monthSpent} budget={uiState.monthlyBudget} currency={currency} />
          ) : null}

          <div className="card record-filters insights-glass-island">
            <div className="record-toolbar">
              <IosSegmentedControl
                className="record-period-segmented"
                options={periodOptions.map((p) => ({ value: p.key, label: p.label }))}
                value={uiState.listPeriod}
                onChange={(key) => setListPeriod(key as RecordListPeriod)}
              />
              <div className={`record-search${uiState.searchQuery ? ' record-search--active' : ''}`}>
                <IconSearch className="record-search__icon" width={18} height={18} aria-hidden />
                <input
                  className="record-search__input"
                  type="search"
                  placeholder={t('recordSearchPlaceholder')}
                  aria-label={t('recordSearchPlaceholder')}
                  value={uiState.searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {uiState.searchQuery ? (
                  <button
                    type="button"
                    className="record-search__clear"
                    aria-label={t('actionClear')}
                    onClick={() => setSearchQuery('')}
                  >
                    <IconClose width={16} height={16} aria-hidden />
                  </button>
                ) : null}
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

            {!uiState.loadError && uiState.listCount > 0 && uiState.insights.topCategoryName ? (
              <div className="record-filters__insight" role="status">
                <span className="record-filters__insight-icon" aria-hidden>
                  <IconInsights width={14} height={14} />
                </span>
                <span className="record-filters__insight-label">
                  {t('recordMostSpentOn', { name: uiState.insights.topCategoryName })}
                </span>
              </div>
            ) : null}
          </div>

          {onAdd ? addButton('btn btn-primary record-sidebar-add-btn', (
            <>
              <IconAdd width={18} height={18} aria-hidden />
              {t('addTransaction')}
            </>
          )) : null}
        </div>

        <div className="record-view__main">
      {uiState.loadError ? (
        <EmptyState
          title={t('recordErrorTitle')}
          subtitle={uiState.loadError}
          icon={<IconCloudOff width={28} height={28} />}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void reload(true)}>
              {t('recordErrorRetry')}
            </button>
          }
        />
      ) : uiState.loading && uiState.displayExpenses.length === 0 ? (
        <LoadingGlassSpinner />
      ) : uiState.listCount === 0 ? (
        (() => {
          const empty = recordEmptyCopy(uiState, t);
          return (
        <EmptyState
          title={empty.title}
          subtitle={empty.subtitle}
          hint={empty.hint}
          icon={<IconRecord width={28} height={28} />}
          action={
            empty.showAdd && onAdd ? addButton('btn btn-primary', t('recordEmptyAction')) : undefined
          }
        />
          );
        })()
      ) : (
        <>
          <div className="transaction-list-bare">
          {grouped.map(({ label, items }, sectionIndex) => {
            const dayTotals = uiState.dayTotalsByLabel[label];
            return (
            <section
              key={label}
              className="transaction-list-bare__section record-day-section"
              style={{ animationDelay: `${Math.min(sectionIndex * 0.05, 0.25)}s` }}
            >
              <div className="record-day-header insights-glass-island">
                <span className="record-day-header__label">{label}</span>
                {dayTotals && (dayTotals.income > 0 || dayTotals.expense > 0) ? (
                  <span className="record-day-header__totals">
                    {dayTotals.income > 0 ? (
                      <span className="record-day-header__income">+{formatAmount(dayTotals.income, currency)}</span>
                    ) : null}
                    {dayTotals.expense > 0 ? (
                      <span className="record-day-header__expense">-{formatAmount(dayTotals.expense, currency)}</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <div className="transaction-list-bare__rows insights-glass-island">
              {items.map((expense) => (
                <SwipeableRow
                  key={expense.id}
                  onDelete={() => setDeleteTargetId(expense.id!)}
                  onTap={() => onEdit(expense.id!)}
                  onLongPress={() => void duplicateExpense(expense)}
                >
                  <TransactionRow
                    expense={expense}
                    category={catMap.get(expense.categoryId)}
                    currency={currency}
                    onClick={() => onEdit(expense.id!)}
                    onLongClick={() => void duplicateExpense(expense)}
                    onReceiptClick={isReceiptPath(expense.receiptImagePath) ? () => setReceiptPath(expense.receiptImagePath!) : undefined}
                  />
                </SwipeableRow>
              ))}
              </div>
            </section>
          );
          })}
          <LoadMoreSentinel hasMore={uiState.hasMore} loading={uiState.loadingMore} onVisible={loadMore} />
          </div>
        </>
      )}
        </div>
      </div>

      {deleteTargetId != null ? (
        <ConfirmDialog
          title={t('recordDeleteTitle')}
          cancelLabel={t('recordDeleteCancel')}
          confirmLabel={t('recordDeleteConfirm')}
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={() => {
            const id = deleteTargetId;
            setDeleteTargetId(null);
            void requestDelete(id);
          }}
        >
          {t('recordDeleteMessage')}
        </ConfirmDialog>
      ) : null}

      {receiptPath ? <ReceiptPreview path={receiptPath} onClose={() => setReceiptPath(null)} /> : null}
    </div>
    </PullToRefreshSurface>
  );
}

const TransactionRow = memo(({ expense, category, currency, onClick, onLongClick, onReceiptClick }: {
  expense: Expense;
  category?: Category;
  currency: string;
  onClick?: () => void;
  onLongClick?: () => void;
  onReceiptClick?: () => void;
}) => {
  const { t } = useTranslation();
  const isIncome = expense.transactionType === 'income';
  const isTransfer = expense.transactionType === 'transfer';

  const color = category ? colorIntToHex(category.colorInt) : '#888';
  const transferColor = readCssColor('--color-transfer');
  const amountColor = isIncome
    ? 'var(--color-income)'
    : isTransfer
      ? 'var(--color-transfer)'
      : 'var(--color-on-background)';
  const prefix = isIncome ? '+' : expense.transactionType === 'expense' ? '-' : '';

  const note = expense.note?.trim();
  const categoryName = category?.name || t('recordUnknownCategory');
  const badgeFill = isTransfer
    ? transferColor
    : readCssColor(isIncome ? '--color-income' : '--color-expense');
  const badgeIconColor = contrastColorOn(badgeFill);
  const iconTint = isTransfer ? transferColor : color;

  const amountText = formatAmount(expense.amount, currency);
  const rowLabel = isIncome
    ? t('descIncomeRow', { category: categoryName, amount: amountText, note: note || '' })
    : isTransfer
      ? t('descTransferRow', { category: categoryName, amount: amountText, note: note || '' })
      : t('descExpenseRow', { category: categoryName, amount: amountText, note: note || '' });

  return (
    <div className="transaction-row pressable-row">
      <button
        type="button"
        className="transaction-row__main"
        onClick={onClick}
        onContextMenu={onLongClick}
        aria-label={rowLabel}
      >
      <div className="transaction-row__icon-wrap">
        <div className="transaction-row__icon" style={{ '--cat-color': iconTint } as CSSProperties}>
          {isTransfer ? (
            <IconArrowLeftRight width={18} height={18} color={iconTint} />
          ) : category ? (
            <CategoryLucideIcon iconName={category.iconName} width={18} height={18} color={iconTint} />
          ) : (
            <span className="transaction-row__icon-fallback" />
          )}
        </div>
        <div
          className={`transaction-row__indicator${isTransfer ? ' transaction-row__indicator--transfer' : ''}`}
          style={{ background: isTransfer ? transferColor : isIncome ? 'var(--color-income)' : 'var(--color-expense)' }}
        >
          {isTransfer ? (
            <IconArrowLeftRight width={8} height={8} color={badgeIconColor} />
          ) : isIncome ? (
            <IconArrowUp width={8} height={8} color={badgeIconColor} />
          ) : (
            <IconArrowDown width={8} height={8} color={badgeIconColor} />
          )}
        </div>
      </div>
      <div className="transaction-row__meta" aria-hidden="true">
        <div className="transaction-row__title">{categoryName}</div>
        {note && <div className="transaction-row__sub">{note}</div>}
      </div>
      <div className="transaction-row__amount tabular-nums" style={{ color: amountColor }} aria-hidden="true">
        {prefix}{amountText}
      </div>
      </button>
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
    </div>
  );
});

function LoadMoreSentinel({ hasMore, loading, onVisible }: { hasMore: boolean; loading?: boolean; onVisible: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loading || !ref.current) return;
    const node = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible();
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, onVisible]);
  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="record-load-more" aria-busy={loading || undefined}>
      {loading ? <span className="record-load-more__spinner receipt-preview__spinner" aria-label={t('loading')} /> : null}
    </div>
  );
}

function recordEmptyCopy(
  uiState: { searchQuery: string; typeFilter: TransactionTypeFilter; listPeriod: import('@/models/types').RecordListPeriod },
  t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string,
) {
  if (hasActiveFilters(uiState)) {
    return { title: t('recordNoMatchesTitle'), subtitle: t('recordNoMatchesSubtitle'), hint: undefined, showAdd: false };
  }
  if (uiState.listPeriod === 'this_month') {
    return { title: t('recordEmptyMonthTitle'), subtitle: t('recordEmptyMonthSubtitle'), hint: t('recordGestureHints'), showAdd: true };
  }
  return { title: t('recordEmptyTitle'), subtitle: t('recordEmptySubtitle'), hint: t('recordGestureHints'), showAdd: true };
}

function hasActiveFilters(uiState: { searchQuery: string; typeFilter: TransactionTypeFilter }): boolean {
  return Boolean(uiState.searchQuery.trim()) || uiState.typeFilter !== 'all';
}

function filterLabel(f: TransactionTypeFilter, t: (key: import('@/i18n').TranslationKey, params?: Record<string, string>) => string): string {
  switch (f) {
    case 'all': return t('filterAll');
    case 'expense': return t('filterExpense');
    case 'income': return t('filterIncome');
    case 'transfer': return t('filterTransfer');
  }
}
