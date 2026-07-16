import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { ReceiptPreview, ReceiptThumbnail } from '@/components/ReceiptPreview';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconCamera, IconDelete, IconClose } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useRef, useEffect, useState, useCallback } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showRemoveReceiptConfirm, setShowRemoveReceiptConfirm] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState(false);
  const handleEscape = useCallback(() => {
    if (!suspended) onClose();
  }, [onClose, suspended]);
  useFocusTrap(!showRemoveReceiptConfirm && !previewReceipt && !suspended, dialogRef, handleEscape);
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
        <div className="card--pro max-w-xl w-full p-10 text-center text-sm font-semibold text-on-surface-variant">
          {t('loading')}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4"
        onClick={onClose}
        aria-hidden={suspended || undefined}
        style={suspended ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      >
        <div
          ref={dialogRef}
          className="card--pro max-w-xl w-full p-8 sm:p-10 flex flex-col gap-8 shadow-2xl overflow-y-auto max-h-[95vh]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-txn-title"
          tabIndex={-1}
        >
          <div className="flex items-center justify-between">
            <h2 id="add-txn-title" className="text-2xl font-black tracking-tight">
              <SignatureText text={vm.isEditing ? t('editTransaction') : t('addTransaction')} />
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('actionClose')}>
              <IconClose width={20} height={20} aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-8">
            <IosSegmentedControl
              aria-label={t('addTransaction')}
              options={(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => ({
                value: type,
                label: t(`type${type.charAt(0).toUpperCase()}${type.slice(1)}` as 'typeExpense' | 'typeIncome' | 'typeTransfer'),
              }))}
              value={vm.form.transactionType}
              onChange={(type) => vm.setForm((f) => ({ ...f, transactionType: type }))}
            />

            <div className="flex flex-col gap-2">
              <label htmlFor="txn-amount" className="field__label">{t('addAmountLabel')}</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-on-surface-variant" aria-hidden>{currencySymbol(currency)}</span>
                <input
                  id="txn-amount"
                  ref={amountInputRef}
                  className="field__input w-full pl-14 pr-6 py-5 rounded-2xl text-3xl font-black tabular-nums"
                  placeholder={zeroPlaceholder(currency)}
                  inputMode="decimal"
                  value={vm.form.amountInput}
                  onChange={(e) => vm.setAmountInput(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
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

            <div className="flex flex-col gap-4">
              <div className="field__label mb-1" id="txn-category-label">{t('addCategoryLabel')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="group" aria-labelledby="txn-category-label">
                {vm.categories.length === 0 ? (
                  <div className="col-span-full categories-empty py-10 border border-dashed border-white/5 rounded-2xl bg-background/30">
                    <p className="categories-empty__text text-center mb-4">{t('categoriesEmptyHint')}</p>
                    {onManageCategories ? (
                      <button type="button" className="btn btn-primary" onClick={onManageCategories}>
                        {t('addCategory')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  vm.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 active:scale-95 ${vm.form.categoryId === cat.id ? 'border-income bg-income/10' : 'border-white/5 bg-surface/60 hover:bg-on-surface/5 hover:border-white/10'}`}
                      onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
                      aria-pressed={vm.form.categoryId === cat.id}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-background shrink-0" style={{ color: colorIntToHex(cat.colorInt) }}>
                        <CategoryLucideIcon iconName={cat.iconName} size={20} />
                      </div>
                      <span className="text-sm font-bold truncate text-left">{cat.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="txn-note" className="field__label">{t('noteLabel')}</label>
              <input
                id="txn-note"
                className="field__input"
                placeholder={t('notePlaceholder')}
                value={vm.form.note}
                onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-background/40 border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
                <button
                  type="button"
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90 ${vm.form.receiptImagePath ? 'bg-income text-on-income shadow-lg' : 'bg-surface border border-white/10 text-on-surface-variant hover:border-white/20 hover:text-white'}`}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t('addScanReceipt')}
                >
                  <IconCamera width={22} height={22} aria-hidden />
                </button>
                <div className="flex-1 min-w-0" onClick={() => fileInputRef.current?.click()} role="presentation">
                  <div className="text-sm font-bold truncate leading-tight">{vm.form.receiptImagePath ? t('receiptAttached') : t('addScanReceipt')}</div>
                  <div className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mt-0.5">{t('tapToChange')}</div>
                </div>
                {vm.form.receiptImagePath && (
                  <div className="flex items-center gap-2">
                    <ReceiptThumbnail path={vm.form.receiptImagePath} onClick={() => setPreviewReceipt(true)} />
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => setShowRemoveReceiptConfirm(true)} aria-label={t('addRemoveReceiptTitle')}>
                      <IconDelete width={18} height={18} aria-hidden />
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void vm.attachReceipt(e.target.files[0])} />
              </div>
              <p className="text-[10px] font-medium text-on-surface-variant px-1 leading-relaxed">{t('receiptDeviceLocal')}</p>
            </div>

            {vm.error ? (
              <p className="text-xs font-semibold text-expense px-1" role="alert">{vm.error}</p>
            ) : null}
          </div>

          <button
            type="button"
            className="btn btn-primary w-full py-4 rounded-xl text-base hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 mt-4"
            onClick={() => void handleSave()}
            disabled={vm.saving}
          >
            {vm.saving ? (
               <div className="flex items-center justify-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full animate-spin"
                    style={{ border: '2px solid color-mix(in srgb, currentColor 25%, transparent)', borderTopColor: 'currentColor' }}
                    aria-hidden
                  />
                  <span>{t('actionSaving')}</span>
               </div>
            ) : t('actionSave').toLowerCase()}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showRemoveReceiptConfirm}
        title={t('addRemoveReceiptTitle')}
        message={t('addRemoveReceiptMessage')}
        confirmLabel={t('actionDelete')}
        onConfirm={() => {
          setShowRemoveReceiptConfirm(false);
          void vm.removeReceipt();
        }}
        onCancel={() => setShowRemoveReceiptConfirm(false)}
      />

      {previewReceipt && vm.form.receiptImagePath ? (
        <ReceiptPreview path={vm.form.receiptImagePath} onClose={() => setPreviewReceipt(false)} />
      ) : null}
    </>
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
