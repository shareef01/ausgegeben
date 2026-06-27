import type { CSSProperties } from 'react';
import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { categoryIcon, SignatureText } from '@/components/ui';
import { ReceiptThumbnail } from '@/components/ReceiptPreview';
import { colorIntToHex } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useRef } from 'react';

interface AddTransactionViewProps {
  expenseId?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionView({ expenseId, onClose, onSaved }: AddTransactionViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const vm = useAddTransactionViewModel(expenseId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const ok = await vm.save();
    if (ok) onSaved();
  };

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="sheet sheet--transaction" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet__header">
          <h2 className="sheet__title">
            <SignatureText text={vm.isEditing ? t('editTransaction') : t('addTransaction')} as="span" />
          </h2>
          <button type="button" className="sheet__close" onClick={onClose}>{t('actionClose')}</button>
        </div>

        <div className="segmented sheet__segmented">
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
            <button key={type} type="button" className={vm.form.transactionType === type ? 'active' : ''} onClick={() => vm.setForm((f) => ({ ...f, transactionType: type }))}>
              {typeLabel(type)}
            </button>
          ))}
        </div>

        <div className="amount-entry">
          <div className="amount-hero" aria-live="polite">
            <span className="amount-hero__currency">{currencySymbol(currency)}</span>
            <span className="amount-hero__value tabular-nums">{vm.form.amountInput || '0,00'}</span>
          </div>
          <label className="field amount-entry__field">
            <span className="field__label">{t('addAmountLabel')}</span>
            <input
              className="field__input amount-entry__input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={vm.form.amountInput}
              onChange={(e) => vm.setAmountInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
          </label>

          <div className="numpad numpad--compact" aria-label="Amount keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((key) => (
              <button
                key={key}
                type="button"
                className="numpad__key"
                onClick={() => (key === '⌫' ? vm.backspace() : vm.appendDigit(key))}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">{t('addCategoryLabel')}</span>
          <div className="category-picker">
            {vm.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`category-picker__chip ${vm.form.categoryId === cat.id ? 'category-picker__chip--active' : ''}`}
                style={{ '--cat-color': colorIntToHex(cat.colorInt) } as CSSProperties}
                onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
              >
                {categoryIcon(cat.iconName)} {cat.name}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span className="field__label">{t('noteLabel')}</span>
          <input
            className="field__input"
            value={vm.form.note}
            onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>

        <div className="receipt-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void vm.attachReceipt(file);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            📷 {t('addScanReceipt')}
          </button>
          {vm.form.receiptImagePath ? (
            <>
              <ReceiptThumbnail path={vm.form.receiptImagePath} onClick={() => fileInputRef.current?.click()} />
              <button type="button" className="receipt-row__remove" onClick={() => void vm.removeReceipt()}>{t('addRemoveReceipt')}</button>
            </>
          ) : null}
        </div>

        <label className="field">
          <span className="field__label">{t('dateLabel')}</span>
          <input
            className="field__input"
            type="datetime-local"
            value={toLocalInput(vm.form.dateMillis)}
            onChange={(e) => vm.setForm((f) => ({ ...f, dateMillis: new Date(e.target.value).getTime() }))}
          />
        </label>

        {vm.error ? <p className="sheet__error">{vm.error}</p> : null}

        <button type="button" className="btn btn-primary btn-block sheet__save" onClick={() => void handleSave()} disabled={vm.saving}>
          {t('actionSave')}
        </button>
      </div>
    </div>
  );
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function currencySymbol(currency: string): string {
  return currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
}
