import { useMemo, useState } from 'react';
import { ScreenTitle, EmptyState, categoryIcon } from '@/components/ui';
import { FinanceSummaryCard } from '@/components/FinanceSummaryCard';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';
import { PremiumPeriodSelector, recordPeriodOptions } from '@/components/PeriodSelector';
import { SwipeableRow } from '@/components/SwipeableRow';
import { ReceiptPreview } from '@/components/ReceiptPreview';
import { useRecordViewModel } from '@/viewmodels/useRecordViewModel';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { formatDateLabel, formatTime, dayKey } from '@/utils/periodUtils';
import type { Expense, Category, TransactionTypeFilter, RecordListPeriod } from '@/models/types';
import { colorIntToHex, formatAmount } from '@/utils/currency';
import { isReceiptPath } from '@/services/receiptService';

interface RecordViewProps {
  onAdd: () => void;
  onEdit: (id: number) => void;
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

  return (
    <div>
      <ScreenTitle title={t('screenRecord')} />
      <FinanceSummaryCard expenses={uiState.expenses} currency={currency} periodLabel={periodLabel} />
      {uiState.monthlyBudget ? (
        <BudgetProgressBar spent={monthSpent} budget={uiState.monthlyBudget} currency={currency} />
      ) : null}

      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <PremiumPeriodSelector
          options={periodOptions}
          selected={periodOptions.find((p) => p.key === uiState.listPeriod)!}
          labelFor={(p) => p.label}
          isSelected={(a, b) => a.key === b.key}
          onSelected={(p) => setListPeriod(p.key as RecordListPeriod)}
        />
        <input
          className="search-input"
          placeholder={t('recordSearchPlaceholder')}
          value={uiState.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="chip-row">
        {(['all', 'expense', 'income', 'transfer'] as TransactionTypeFilter[]).map((f) => (
          <button key={f} type="button" className={`chip ${uiState.typeFilter === f ? 'active' : ''}`} onClick={() => setTypeFilter(f)}>
            {filterLabel(f, t)}
          </button>
        ))}
      </div>

      {uiState.loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>{t('loading')}</p>
      ) : uiState.expenses.length === 0 ? (
        <EmptyState
          title={t('recordEmptyTitle')}
          subtitle={`${t('recordEmptySubtitle')} ${t('recordEmptyHint')}`}
          action={<button className="fab" style={{ position: 'static', margin: '16px auto' }} onClick={onAdd}>+</button>}
        />
      ) : (
        <div className="card" style={{ margin: '8px 16px', overflow: 'hidden' }}>
          {grouped.map(([label, items]) => (
            <section key={label}>
              <div style={{ padding: '10px 16px', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-variant)' }}>{label}</div>
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
  const amountColor = expense.transactionType === 'income' ? 'var(--color-income)' : expense.transactionType === 'transfer' ? 'var(--color-transfer)' : 'var(--color-on-background)';
  const prefix = expense.transactionType === 'income' ? '+' : expense.transactionType === 'expense' ? '-' : '';

  return (
    <div className="transaction-row" onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} role="button" tabIndex={0}>
      <div className="transaction-row__icon" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        {category ? categoryIcon(category.iconName) : '•'}
      </div>
      <div className="transaction-row__meta">
        <div className="transaction-row__title">{expense.note || category?.name || 'Transaction'}</div>
        <div className="transaction-row__sub">{category?.name} · {formatTime(expense.dateMillis)}</div>
      </div>
      {onReceiptClick ? (
        <button type="button" aria-label={t('recordViewReceipt')} onClick={(e) => { e.stopPropagation(); onReceiptClick(); }} style={{ fontSize: '1.125rem', padding: 4 }}>📎</button>
      ) : null}
      <div style={{ fontWeight: 500, color: amountColor, fontVariantNumeric: 'tabular-nums' }}>
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
