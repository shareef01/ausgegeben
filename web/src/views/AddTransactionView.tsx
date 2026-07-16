import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconClose } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useRef, useEffect, useCallback } from 'react';
import { useHaptics } from '@/hooks/useHaptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface AddTransactionViewProps {
  expenseId?: string;
  suspended?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onManageCategories?: () => void;
}

export function AddTransactionView({
  expenseId,
  suspended = false,
  onClose,
  onSaved,
  onManageCategories,
}: AddTransactionViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const vm = useAddTransactionViewModel(expenseId);
  const haptics = useHaptics();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => {
    if (!suspended) onClose();
  }, [onClose, suspended]);
  useFocusTrap(!suspended, dialogRef, handleEscape);
  useBodyScrollLock(!suspended);

  useEffect(() => {
    if (vm.ready && !suspended) amountInputRef.current?.focus();
  }, [vm.ready, suspended]);

  const wasSuspended = useRef(false);
  useEffect(() => {
    if (wasSuspended.current && !suspended) void vm.reloadCategories();
    wasSuspended.current = suspended;
  }, [suspended, vm.reloadCategories]);

  const handleSave = async () => {
    const ok = await vm.save();
    if (ok) {
      haptics.success();
      onSaved();
    }
  };

  if (!vm.ready) {
    return (
      <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4" role="status" aria-live="polite">
        <div className="card--pro add-txn add-txn--loading">
          {t('loading')}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
      aria-hidden={suspended || undefined}
      style={suspended ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
    >
      <div
        ref={dialogRef}
        className="card--pro add-txn"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-txn-title"
        tabIndex={-1}
      >
        <div className="add-txn__header">
          <h2 id="add-txn-title" className="modal-title add-txn__title">
            <SignatureText text={vm.isEditing ? t('editTransaction') : t('addTransaction')} />
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('actionClose')}>
            <IconClose width={20} height={20} aria-hidden />
          </button>
        </div>

        <div className="add-txn__body">
          <IosSegmentedControl
            aria-label={t('addTransaction')}
            options={(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => ({
              value: type,
              label: t(`type${type.charAt(0).toUpperCase()}${type.slice(1)}` as 'typeExpense' | 'typeIncome' | 'typeTransfer'),
            }))}
            value={vm.form.transactionType}
            onChange={(type) => vm.setForm((f) => ({ ...f, transactionType: type }))}
          />

          <div className="field">
            <label htmlFor="txn-amount" className="field__label">{t('addAmountLabel')}</label>
            <div className="add-txn__amount">
              <span className="add-txn__currency" aria-hidden>{currencySymbol(currency)}</span>
              <input
                id="txn-amount"
                ref={amountInputRef}
                className="field__input add-txn__amount-input"
                placeholder={zeroPlaceholder(currency)}
                inputMode="decimal"
                value={vm.form.amountInput}
                onChange={(e) => vm.setAmountInput(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="txn-date" className="field__label">{t('dateLabel')}</label>
            <input
              id="txn-date"
              type="date"
              className="field__input"
              value={toDateInputValue(vm.form.dateMillis)}
              onChange={(e) => {
                if (!e.target.value) return;
                vm.setForm((f) => ({ ...f, dateMillis: fromDateInputValue(e.target.value) }));
              }}
            />
          </div>

          <div className="field">
            <div className="field__label" id="txn-category-label">{t('addCategoryLabel')}</div>
            <div className="add-txn__cats" role="group" aria-labelledby="txn-category-label">
              {vm.categories.length === 0 ? (
                <div className="categories-empty add-txn__cats-empty">
                  <p className="categories-empty__text">{t('categoriesEmptyHint')}</p>
                  {onManageCategories ? (
                    <button type="button" className="btn btn-primary" onClick={onManageCategories}>
                      {t('addCategory')}
                    </button>
                  ) : null}
                </div>
              ) : (
                vm.categories.map((cat) => {
                  const selected = vm.form.categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`add-txn__cat${selected ? ' add-txn__cat--selected' : ''}`}
                      onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
                      aria-pressed={selected}
                    >
                      <span
                        className="add-txn__cat-icon"
                        style={{ color: colorIntToHex(cat.colorInt) }}
                      >
                        <CategoryLucideIcon iconName={cat.iconName} size={18} />
                      </span>
                      <span className="add-txn__cat-name">{cat.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="txn-note" className="field__label">{t('noteLabel')}</label>
            <input
              id="txn-note"
              className="field__input"
              placeholder={t('notePlaceholder')}
              value={vm.form.note}
              onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>

          {vm.error ? (
            <p className="add-txn__error" role="alert">{vm.error}</p>
          ) : null}
        </div>

        <div className="add-txn__footer">
          <button
            type="button"
            className="btn btn-primary add-txn__save"
            onClick={() => void handleSave()}
            disabled={vm.saving}
          >
            {vm.saving ? (
              <span className="add-txn__saving">
                <span className="add-txn__spinner" aria-hidden />
                <span>{t('actionSaving')}</span>
              </span>
            ) : t('actionSave').toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

function currencySymbol(currency: string): string {
  return currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
}

function decimalSep(currency: string): string {
  return currency === 'EUR' ? ',' : '.';
}

function zeroPlaceholder(currency: string): string {
  return `0${decimalSep(currency)}00`;
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
