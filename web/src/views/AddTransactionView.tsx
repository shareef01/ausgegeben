import type { CSSProperties } from 'react';
import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { ReceiptThumbnail } from '@/components/ReceiptPreview';
import { colorIntToHex } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useRef, useEffect } from 'react';

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
  const amountInputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    amountInputRef.current?.focus();
    return () => {
      previousFocus.current?.focus();
    };
  }, []);

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
    <div className="overlay overlay--transaction" onClick={onClose} role="presentation">
      <div
        className="sheet sheet--transaction sheet--transaction-premium"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
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
          <div className="amount-hero amount-hero--mobile-only" aria-live="polite">
            <span className="amount-hero__currency">{currencySymbol(currency)}</span>
            <span className="amount-hero__value tabular-nums">{vm.form.amountInput || '0,00'}</span>
          </div>
          <label className="field amount-entry__field">
            <span className="field__label">{t('addAmountLabel')}</span>
            <input
              ref={amountInputRef}
              className="field__input amount-entry__input amount-entry__input--desktop"
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

          <div className="numpad numpad--compact numpad--mobile-only" aria-label="Amount keypad">
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
          {!vm.ready ? (
            <div className="category-tiles" aria-busy="true">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="category-tile category-tile--skeleton">
                  <span className="category-tile__icon skeleton skeleton--circle" />
                  <span className="category-tile__name skeleton skeleton--text" />
                </div>
              ))}
            </div>
          ) : (
            <div className="category-tiles" role="listbox" aria-label={t('addCategoryLabel')}>
            {vm.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="option"
                aria-selected={vm.form.categoryId === cat.id}
                className={`category-tile ${vm.form.categoryId === cat.id ? 'category-tile--active' : ''}`}
                style={{ '--cat-color': colorIntToHex(cat.colorInt) } as CSSProperties}
                onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
              >
                <span className="category-tile__icon" aria-hidden>
                  <CategoryLucideIcon iconName={cat.iconName} size={22} />
                </span>
                <span className="category-tile__name">{cat.name}</span>
              </button>
            ))}
            </div>
          )}
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
          {vm.saving ? (
            <span className="btn__spinner" aria-label={t('syncInProgress')}>
              <span className="spin-dot" />
              <span className="spin-dot" />
              <span className="spin-dot" />
            </span>
          ) : (
            t('actionSave')
          )}
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
