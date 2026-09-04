import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconClose } from '@/components/Icons';
import { colorIntToHex, parseAmount, currencySymbol } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useRef, useEffect, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useCssProps } from '@/utils/cssVars';
import { useHaptics } from '@/hooks/useHaptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const catsRailRef = useRef<HTMLDivElement>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Match Android: prompt only for new transactions that have any draft signal
  // (amount, note, category, or a non-expense type). Edits close immediately.
  const hasUnsavedChanges = useMemo(() => {
    const amount = parseAmount(vm.form.amountInput, currency) ?? 0;
    return (
      vm.form.note.trim().length > 0 ||
      amount > 0 ||
      Boolean(vm.form.categoryId) ||
      vm.form.transactionType !== 'expense'
    );
  }, [vm.form, currency]);

  const requestClose = useCallback(() => {
    if (suspended) return;
    if (!vm.isEditing && hasUnsavedChanges) {
      haptics.light();
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [suspended, vm.isEditing, hasUnsavedChanges, haptics, onClose]);

  const handleEscape = useCallback(() => {
    requestClose();
  }, [requestClose]);
  useFocusTrap(!suspended && !showDiscardConfirm, dialogRef, handleEscape);
  useBodyScrollLock(!suspended);

  useEffect(() => {
    if (vm.ready && !suspended) amountInputRef.current?.focus();
  }, [vm.ready, suspended]);

  useEffect(() => {
    if (!vm.ready || suspended || !vm.form.categoryId) return;
    const selected = catsRailRef.current?.querySelector<HTMLElement>('.add-txn__cat--selected');
    selected?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [vm.ready, suspended, vm.form.categoryId, vm.categories]);

  const wasSuspended = useRef(false);
  useEffect(() => {
    if (wasSuspended.current && !suspended) void vm.reloadCategories();
    wasSuspended.current = suspended;
  }, [suspended, vm.reloadCategories]);

  const amountError = vm.error === t('errorValidAmount');
  const categoryError = vm.error === t('errorChooseCategory');
  const formErrorId = vm.error ? 'add-txn-error' : undefined;

  const handleSave = async () => {
    const result = await vm.save();
    if (result.ok) {
      haptics.success();
      const savedNotice = vm.isEditing ? t('transactionUpdated') : t('transactionSaved');
      const message = result.budgetAlert
        ? `${savedNotice} · ${result.budgetAlert}`
        : savedNotice;
      useToastStore.getState().show(message);
      onSaved();
    }
  };

  return (
    <>
    <div
      className={`fixed inset-0 z-[200] safe-overlay bg-background/80 backdrop-blur-xl flex items-center justify-center${suspended ? ' safe-overlay--suspended' : ''}`}
      onClick={requestClose}
      aria-hidden={suspended || undefined}
    >
      <div
        ref={dialogRef}
        className={`card--pro add-txn${!vm.ready ? ' add-txn--loading' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={vm.ready ? 'add-txn-title' : undefined}
        aria-label={vm.ready ? undefined : t('loading')}
        tabIndex={-1}
      >
        {!vm.ready ? (
          <div role="status" aria-live="polite">{t('loading')}</div>
        ) : (
        <>
        <div className="add-txn__header">
          <h2 id="add-txn-title" className="modal-title add-txn__title">
            <SignatureText text={vm.isEditing ? t('editTransaction') : t('addTransaction')} />
          </h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label={t('actionClose')}>
            <IconClose width={20} height={20} aria-hidden />
          </button>
        </div>

        <div className="add-txn__body" {...(vm.loadFailed ? { inert: true } : {})}>
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
                disabled={vm.loadFailed}
                aria-invalid={amountError || undefined}
                aria-describedby={amountError ? formErrorId : undefined}
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
              disabled={vm.loadFailed}
              onChange={(e) => {
                if (!e.target.value) return;
                vm.setForm((f) => ({ ...f, dateMillis: fromDateInputValue(e.target.value) }));
              }}
            />
          </div>

          <div className="field">
            <div className="field__label" id="txn-category-label">{t('addCategoryLabel')}</div>
            <div
              ref={catsRailRef}
              className="add-txn__cats"
              role="group"
              aria-labelledby="txn-category-label"
              aria-invalid={categoryError || undefined}
              aria-describedby={categoryError ? formErrorId : undefined}
            >
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
                      <CatIcon color={colorIntToHex(cat.colorInt)}>
                        <CategoryLucideIcon iconName={cat.iconName} size={22} />
                      </CatIcon>
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
            <p id="add-txn-error" className="add-txn__error" role="alert">{vm.error}</p>
          ) : null}
        </div>

        <div className="add-txn__footer">
          {vm.loadFailed ? (
            <>
              <button
                type="button"
                className="btn btn-secondary add-txn__save"
                onClick={() => void vm.reload()}
              >
                {t('actionRetry')}
              </button>
              <button
                type="button"
                className="btn btn-primary add-txn__save"
                onClick={onClose}
              >
                {t('actionClose')}
              </button>
            </>
          ) : (
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
          )}
        </div>
        </>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={showDiscardConfirm}
      title={t('addUnsavedTitle')}
      message={t('addUnsavedBody')}
      confirmLabel={t('addDiscard')}
      cancelLabel={t('actionCancel')}
      onConfirm={() => {
        setShowDiscardConfirm(false);
        onClose();
      }}
      onCancel={() => setShowDiscardConfirm(false)}
    />
    </>
  );
}

function CatIcon({ color, children }: { color: string; children: ReactNode }) {
  const ref = useCssProps<HTMLSpanElement>({ '--cat-color': color });
  return (
    <span ref={ref} className="add-txn__cat-icon">
      {children}
    </span>
  );
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
