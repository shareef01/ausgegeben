import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { ReceiptThumbnail } from '@/components/ReceiptPreview';
import { IconCamera, IconDelete, IconClose } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useHaptics } from '@/hooks/useHaptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface AddTransactionViewProps {
  expenseId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionView({ expenseId, onClose, onSaved }: AddTransactionViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const vm = useAddTransactionViewModel(expenseId);
  const haptics = useHaptics();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showRemoveReceiptConfirm, setShowRemoveReceiptConfirm] = useState(false);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(!showRemoveReceiptConfirm, dialogRef, handleEscape);

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  const handleSave = async () => {
    const ok = await vm.save();
    if (ok) {
      haptics.success();
      onSaved();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
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
            <button type="button" className="w-10 h-10 rounded-full bg-surface border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-zinc-400 hover:text-white" onClick={onClose} aria-label={t('actionClose')}>
              <IconClose width={20} height={20} aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-8">
            <div className="segmented">
              {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`segmented__item ${vm.form.transactionType === type ? 'segmented__item--active' : ''}`}
                  onClick={() => vm.setForm((f) => ({ ...f, transactionType: type }))}
                >
                  {t(`type${type.charAt(0).toUpperCase()}${type.slice(1)}` as 'typeExpense' | 'typeIncome' | 'typeTransfer')}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="txn-amount" className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('addAmountLabel')}</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-600" aria-hidden>{currencySymbol(currency)}</span>
                <input
                  id="txn-amount"
                  ref={amountInputRef}
                  className="w-full pl-14 pr-6 py-5 bg-surface border border-white/10 rounded-2xl text-3xl font-black tabular-nums focus:outline-none focus:ring-1 focus:ring-[#10B981] focus:border-[#10B981] outline-none transition-all"
                  placeholder={zeroPlaceholder(currency)}
                  inputMode="decimal"
                  value={vm.form.amountInput}
                  onChange={(e) => vm.setAmountInput(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="txn-date" className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('dateLabel')}</label>
              <input
                id="txn-date"
                type="date"
                className="w-full px-4 py-3 bg-surface border border-white/10 rounded-xl text-sm font-semibold text-on-background focus:outline-none focus:ring-1 focus:ring-[#10B981] focus:border-[#10B981] transition-all"
                value={toDateInputValue(vm.form.dateMillis)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  vm.setForm((f) => ({ ...f, dateMillis: fromDateInputValue(e.target.value) }));
                }}
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1" id="txn-category-label">{t('addCategoryLabel')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="group" aria-labelledby="txn-category-label">
                {vm.categories.length === 0 ? (
                  <div className="col-span-full categories-empty py-10 border border-dashed border-white/5 rounded-2xl bg-[#0C0C0E]/30">
                    <p className="text-xs font-medium text-zinc-600 text-center uppercase tracking-widest">{t('categoriesEmptyHint')}</p>
                  </div>
                ) : (
                  vm.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 active:scale-95 ${vm.form.categoryId === cat.id ? 'border-[#10B981] bg-[#10B981]/10 shadow-[0_0_20px_rgba(16,185,129,0.08)]' : 'border-white/5 bg-[#121214]/60 hover:bg-[#121214] hover:border-white/10'}`}
                      onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
                      aria-pressed={vm.form.categoryId === cat.id}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#0C0C0E] shrink-0" style={{ color: colorIntToHex(cat.colorInt) }}>
                        <CategoryLucideIcon iconName={cat.iconName} size={20} />
                      </div>
                      <span className="text-sm font-bold truncate text-left">{cat.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="txn-note" className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('noteLabel')}</label>
              <input
                id="txn-note"
                className="w-full px-4 py-3 bg-surface border border-white/10 rounded-xl text-sm font-semibold text-on-background placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#10B981] focus:border-[#10B981] transition-all"
                placeholder="..."
                value={vm.form.note}
                onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0C0C0E]/40 border border-white/5 backdrop-blur-md hover:border-white/10 transition-colors">
              <button
                type="button"
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90 ${vm.form.receiptImagePath ? 'bg-[#10B981] text-[#0C0C0E] shadow-lg shadow-[#10B981]/20' : 'bg-surface border border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'}`}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('addScanReceipt')}
              >
                <IconCamera width={22} height={22} aria-hidden />
              </button>
              <div className="flex-1 min-w-0" onClick={() => fileInputRef.current?.click()} role="presentation">
                <div className="text-sm font-bold truncate leading-tight">{vm.form.receiptImagePath ? t('receiptAttached') : t('addScanReceipt')}</div>
                <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">{t('tapToChange')}</div>
              </div>
              {vm.form.receiptImagePath && (
                <div className="flex items-center gap-2">
                  <ReceiptThumbnail path={vm.form.receiptImagePath} onClick={() => fileInputRef.current?.click()} />
                  <button type="button" className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors active:scale-90" onClick={() => setShowRemoveReceiptConfirm(true)} aria-label={t('addRemoveReceiptTitle')}>
                    <IconDelete width={18} height={18} aria-hidden />
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void vm.attachReceipt(e.target.files[0])} />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary w-full py-4 rounded-xl text-base hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 mt-4"
            onClick={() => void handleSave()}
            disabled={vm.saving}
          >
            {vm.saving ? (
               <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  <span>{t('syncInProgress')}</span>
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
