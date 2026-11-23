import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconCheck, IconClose } from '@/components/Icons';
import { amountPlaceholder, colorIntToHex, currencySymbol } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react';
import { useCssProps } from '@/utils/cssVars';
import { toDateInputValue, withDateInputValue } from '@/utils/periodUtils';
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
  const locale = usePreferencesStore((s) => s.locale);
  const vm = useAddTransactionViewModel(expenseId);
  const haptics = useHaptics();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const catsRailRef = useRef<HTMLDivElement>(null);
  const wasSuspended = useRef(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Dirty state comes from the view model, which compares the current values against
  // the ones this form opened with — for a new draft *and* for an edited transaction.
  // Prompting only for new drafts meant Escape/backdrop taps discarded edits silently.
  const hasUnsavedChanges = vm.isDirty;

  const requestClose = useCallback(() => {
    if (suspended) return;
    if (hasUnsavedChanges) {
      haptics.light();
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [suspended, hasUnsavedChanges, haptics, onClose]);

  const handleEscape = useCallback(() => {
    requestClose();
  }, [requestClose]);
  useFocusTrap(!suspended && !showDiscardConfirm, dialogRef, handleEscape);
  useBodyScrollLock(!suspended);

  useEffect(() => {
    if (vm.ready && !suspended) amountInputRef.current?.focus({ preventScroll: !wasSuspended.current });
  }, [vm.ready, suspended]);

  useEffect(() => {
    const rail = catsRailRef.current;
    if (!vm.ready || suspended || !vm.form.categoryId || !rail) return;
    const horizontalOverflow = rail.scrollWidth > rail.clientWidth;
    const verticalOverflow = rail.scrollHeight > rail.clientHeight;
    if (!horizontalOverflow && !verticalOverflow) return;
    const selected = rail.querySelector<HTMLElement>('.add-txn__cat--selected');
    if (!selected) return;
    const tile = selected.getBoundingClientRect();
    const bounds = rail.getBoundingClientRect();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const verticalOffset = tile.top < bounds.top
      ? tile.top - bounds.top
      : Math.max(0, tile.bottom - bounds.bottom);
    rail.scrollBy({
      left: horizontalOverflow ? tile.left - bounds.left - (bounds.width - tile.width) / 2 : 0,
      top: verticalOverflow ? verticalOffset : 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [vm.ready, suspended, vm.form.categoryId, vm.categories]);

  const { reloadCategories } = vm;
  useEffect(() => {
    if (wasSuspended.current && !suspended) void reloadCategories();
    wasSuspended.current = suspended;
  }, [suspended, reloadCategories]);

  const amountError = vm.error === t('errorValidAmount');
  const categoryError = vm.error === t('errorChooseCategory');
  // Each error region has its own id. The three messages are mutually exclusive today
  // (`vm.error` is one string), but a shared id was a trap: any future change that shows a
  // field error beside the form-level one would emit duplicate ids, and `aria-describedby`
  // would silently resolve to whichever copy came first in the DOM.
  const amountErrorId = amountError ? 'add-txn-amount-error' : undefined;
  const categoryErrorId = categoryError ? 'add-txn-category-error' : undefined;

  const handleSave = async () => {
    const result = await vm.save();
    if (result.ok) {
      haptics.success();
      const savedNotice = result.queued
        ? t(result.queuedInTabOnly ? 'transactionQueuedTabOnly' : 'transactionQueued')
        : vm.isEditing ? t('transactionUpdated') : t('transactionSaved');
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

          <div className="field add-txn__field--amount">
            <label htmlFor="txn-amount" className="field__label">{t('addAmountLabel')}</label>
            <div className="add-txn__amount">
              <span className="add-txn__currency" aria-hidden>{currencySymbol(currency)}</span>
              <input
                id="txn-amount"
                ref={amountInputRef}
                className="field__input add-txn__amount-input"
                placeholder={amountPlaceholder(locale)}
                inputMode="decimal"
                value={vm.form.amountInput}
                onChange={(e) => vm.setAmountInput(e.target.value)}
                disabled={vm.loadFailed}
                aria-invalid={amountError || undefined}
                aria-describedby={amountErrorId}
              />
            </div>
            {amountError ? (
              <p id="add-txn-amount-error" className="add-txn__error" role="alert">{vm.error}</p>
            ) : null}
          </div>

          <div className="field add-txn__field--date">
            <label htmlFor="txn-date" className="field__label">{t('dateLabel')}</label>
            <input
              id="txn-date"
              type="date"
              className="field__input"
              value={toDateInputValue(vm.form.dateMillis)}
              disabled={vm.loadFailed}
              onChange={(e) => {
                if (!e.target.value) return;
                vm.setForm((f) => ({ ...f, dateMillis: withDateInputValue(e.target.value, f.dateMillis) }));
              }}
            />
          </div>

          <div className="field add-txn__field--cats">
            <div className="field__label" id="txn-category-label">{t('addCategoryLabel')}</div>
            <div
              ref={catsRailRef}
              className="add-txn__cats"
              role="group"
              aria-labelledby="txn-category-label"
              aria-invalid={categoryError || undefined}
              aria-describedby={categoryErrorId}
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
                      title={cat.name}
                    >
                      {selected ? (
                        <span className="add-txn__cat-check" aria-hidden>
                          <IconCheck width={12} height={12} strokeWidth={3} />
                        </span>
                      ) : null}
                      <CatIcon color={colorIntToHex(cat.colorInt)}>
                        <CategoryLucideIcon iconName={cat.iconName} size={22} />
                      </CatIcon>
                      <span className="add-txn__cat-name">{cat.name}</span>
                    </button>
                  );
                })
              )}
            </div>
            {categoryError ? (
              <p id="add-txn-category-error" className="add-txn__error" role="alert">{vm.error}</p>
            ) : null}
          </div>

          <div className="field add-txn__field--note">
            <label htmlFor="txn-note" className="field__label">{t('noteLabel')}</label>
            <input
              id="txn-note"
              className="field__input"
              placeholder={t('notePlaceholder')}
              value={vm.form.note}
              onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>

          {/* Field errors sit under their field (above); anything else, such as a failed
              save, stays at the end of the form. */}
          {vm.error && !amountError && !categoryError ? (
            <p id="add-txn-form-error" className="add-txn__error" role="alert">{vm.error}</p>
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

/** A category tile's coloured icon; shared with the recurring-transaction editor. */
export function CatIcon({ color, children }: { color: string; children: ReactNode }) {
  const ref = useCssProps<HTMLSpanElement>({ '--cat-color': color });
  return (
    <span ref={ref} className="add-txn__cat-icon">
      {children}
    </span>
  );
}
