import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { categoryIcon } from '@/components/ui';
import { ReceiptThumbnail } from '@/components/ReceiptPreview';
import { colorIntToHex } from '@/utils/currency';
import { useRef } from 'react';

interface AddTransactionViewProps {
  expenseId?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionView({ expenseId, onClose, onSaved }: AddTransactionViewProps) {
  const { t } = useTranslation();
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
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{vm.isEditing ? t('editTransaction') : t('addTransaction')}</h2>
          <button type="button" onClick={onClose}>{t('actionClose')}</button>
        </div>

        <div className="segmented" style={{ margin: '16px 0' }}>
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
            <button key={type} type="button" className={vm.form.transactionType === type ? 'active' : ''} onClick={() => vm.setForm((f) => ({ ...f, transactionType: type }))}>
              {typeLabel(type)}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minHeight: 56, marginBottom: 8 }}>
          {vm.form.amountInput || '0'}
        </div>

        <div className="numpad" style={{ marginBottom: 16 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((key) => (
            <button key={key} type="button" onClick={() => (key === '⌫' ? vm.backspace() : vm.appendDigit(key))}>{key}</button>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>Category</label>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
          {vm.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => vm.setForm((f) => ({ ...f, categoryId: cat.id! }))}
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                border: vm.form.categoryId === cat.id ? `2px solid ${colorIntToHex(cat.colorInt)}` : '1px solid var(--color-outline)',
                background: 'var(--color-surface-variant)',
                whiteSpace: 'nowrap',
              }}
            >
              {categoryIcon(cat.iconName)} {cat.name}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{t('noteLabel')}</label>
        <input
          value={vm.form.note}
          onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--color-outline)', marginBottom: 12, background: 'var(--color-surface)', color: 'inherit' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--color-outline)', color: vm.form.receiptImagePath ? 'var(--color-accent)' : 'inherit' }}>
            📷 {t('addScanReceipt')}
          </button>
          {vm.form.receiptImagePath ? (
            <>
              <ReceiptThumbnail path={vm.form.receiptImagePath} onClick={() => fileInputRef.current?.click()} />
              <button type="button" onClick={() => void vm.removeReceipt()} style={{ color: 'var(--color-expense)', fontSize: '0.875rem' }}>{t('addRemoveReceipt')}</button>
            </>
          ) : null}
        </div>

        <label style={{ display: 'block', marginBottom: 8, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>{t('dateLabel')}</label>
        <input
          type="datetime-local"
          value={toLocalInput(vm.form.dateMillis)}
          onChange={(e) => vm.setForm((f) => ({ ...f, dateMillis: new Date(e.target.value).getTime() }))}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--color-outline)', marginBottom: 16, background: 'var(--color-surface)', color: 'inherit' }}
        />

        {vm.error ? <p style={{ color: 'var(--color-error)' }}>{vm.error}</p> : null}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={vm.saving}
          style={{ width: '100%', padding: 14, borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontWeight: 600, opacity: vm.saving ? 0.7 : 1 }}
        >
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
