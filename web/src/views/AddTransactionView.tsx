import type { CSSProperties, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Delete, Plus, Receipt, StickyNote } from 'lucide-react';
import type { TransactionType } from '@/models/types';
import { useAddTransactionViewModel } from '@/viewmodels/useAddTransactionViewModel';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { IconArrowLeft, IconCalendar } from '@/components/Icons';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { ReceiptThumbnail, ReceiptPreview } from '@/components/ReceiptPreview';
import { CategoryManageSheet } from '@/components/CategoryManageSheet';
import { CategoryEditor } from '@/components/CategoryEditor';
import { CameraScreen, canUseCamera } from '@/components/CameraScreen';
import { colorIntToHex, parseAmount, decimalSeparator } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { contrastColorOn, readCssColor } from '@/theme/tokens';
import { expenseRepository } from '@/repositories/expenseRepository';
import { normalizeArgbInt } from '@/utils/categoryUtils';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import { formatCalendarDate } from '@/utils/periodUtils';
import { hapticLight, hapticSuccess } from '@/utils/haptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';
interface AddTransactionViewProps {
  expenseId?: number;
  openCameraOnMount?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AddTransactionView({ expenseId, openCameraOnMount = false, onClose, onSaved }: AddTransactionViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const vm = useAddTransactionViewModel(expenseId);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const showToast = useToastStore((s) => s.show);
  const [showCategories, setShowCategories] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptPreviewPath, setReceiptPreviewPath] = useState<string | null>(null);
  const selectedCategoryRef = useRef<HTMLButtonElement | null>(null);
  const openedAtRef = useRef(Date.now());

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!openCameraOnMount || expenseId) return;
    if (canUseCamera()) setShowCamera(true);
    else galleryInputRef.current?.click();
  }, [openCameraOnMount, expenseId]);

  const parsedAmount = parseAmount(vm.form.amountInput);
  const hasAmount = parsedAmount != null && parsedAmount > 0;
  const decKey = decimalSeparator(currency);
  const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decKey, '0', 'back'] as const;
  const hasCategory = Boolean(vm.form.categoryId);
  const canSave = hasAmount && hasCategory && !vm.saving;
  const hasReceipt = Boolean(vm.form.receiptImagePath);
  const typeAccent = typeAccentVar(vm.form.transactionType);

  useSheetScrollLock();

  useEffect(() => {
    if (!vm.form.categoryId) return;
    selectedCategoryRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [vm.form.categoryId]);

  useFocusTrap(true, sheetRef, onClose);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };

  const saveStyle = useMemo(() => {
    const fill = readCssColor(typeAccent);
    return {
      background: fill || `var(${typeAccent})`,
      color: fill ? contrastColorOn(fill) : 'var(--color-on-filled)',
      boxShadow: `0 8px 24px color-mix(in srgb, ${fill || `var(${typeAccent})`} 35%, transparent)`,
    } satisfies CSSProperties;
  }, [vm.form.transactionType, themeMode, typeAccent]);

  const handleReceiptAction = () => {
    if (vm.form.receiptImagePath) {
      setReceiptPreviewPath(vm.form.receiptImagePath);
      return;
    }
    if (canUseCamera()) setShowCamera(true);
    else galleryInputRef.current?.click();
  };

  const handleGalleryFile = (file: File | undefined) => {
    if (file) void vm.attachReceipt(file);
  };

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  const saveLabel = vm.isEditing ? t('addSaveChanges') : t('addConfirmTransaction');

  const childModalOpen = showCategories || showNewCategory || showCamera || showDatePicker || Boolean(receiptPreviewPath);

  useEffect(() => {
    if (childModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [childModalOpen, onClose]);

  const handleNumpadKey = (key: string) => {
    hapticLight();
    if (key === 'back') vm.backspace();
    else vm.appendDigit(key);
  };

  const handleSave = async () => {
    const result = await vm.save();
    if (result.ok) {
      hapticSuccess();
      if (result.budgetAlert) showToast(result.budgetAlert);
      onSaved();
    }
  };

  const overlay = (
    <div className="overlay overlay--transaction" onClick={handleBackdropClick} role="presentation">
      <div
        ref={sheetRef}
        className="sheet sheet--transaction sheet--transaction-premium"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-transaction-title"
      >
        <div className="add-sheet__topbar">
          <button type="button" className="add-sheet__icon-btn insights-glass-island" onClick={onClose} aria-label={t('actionBack')}>
            <IconArrowLeft width={20} height={20} aria-hidden />
          </button>
          <h2 id="add-transaction-title" className="add-sheet__title">
            <SignatureText text={vm.isEditing ? t('editTransaction') : t('addNewTitle')} as="span" />
          </h2>
          <button
            type="button"
            className={`add-sheet__icon-btn insights-glass-island${hasReceipt ? ' add-sheet__icon-btn--accent' : ''}`}
            style={hasReceipt ? ({ '--add-accent': `var(${typeAccent})` } as CSSProperties) : undefined}
            onClick={handleReceiptAction}
            aria-label={hasReceipt ? t('recordViewReceipt') : t('addScanReceipt')}
          >
            {hasReceipt ? <Receipt size={20} aria-hidden /> : <Camera size={20} aria-hidden />}
          </button>
        </div>

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            handleGalleryFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <IosSegmentedControl
          className="sheet__segmented"
          options={(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => ({
            value: type,
            label: typeLabel(type),
          }))}
          value={vm.form.transactionType}
          onChange={(type) => vm.setForm((f) => ({ ...f, transactionType: type }))}
        />

        <div className="add-sheet__scroll">
          <div className="card add-field-group insights-glass-island">
            <button
              type="button"
              className="add-date-row"
              onClick={() => setShowDatePicker(true)}
            >
              <span className="add-date-row__leading">
                <IconCalendar width={18} height={18} className="add-date-row__icon" aria-hidden />
                <span className="add-date-row__label">{t('dateLabel')}</span>
              </span>
              <span className="add-date-row__value tabular-nums">{formatCalendarDate(vm.form.dateMillis)}</span>
            </button>

            <div className="add-field-group__divider" aria-hidden />

            <label className="add-note-field">
              <span className="add-note-field__header">
                <StickyNote size={18} className="add-note-field__icon" aria-hidden />
                <span className="field__label add-field-label">{t('noteLabel')}</span>
              </span>
              <div className="add-note-field__glass">
                <input
                  className="field__input add-note-field__input"
                  placeholder={t('addNotePlaceholder')}
                  value={vm.form.note}
                  onChange={(e) => vm.setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </label>

            {hasReceipt ? (
              <div className="add-note-field__receipt">
                <ReceiptThumbnail
                  path={vm.form.receiptImagePath!}
                  onClick={() => setReceiptPreviewPath(vm.form.receiptImagePath)}
                />
                <button type="button" className="add-note-field__remove" onClick={() => void vm.removeReceipt()}>
                  {t('addRemoveReceipt')}
                </button>
              </div>
            ) : canUseCamera() ? (
              <div className="add-receipt-actions">
                <button type="button" className="add-receipt-actions__link" onClick={() => setShowCamera(true)}>
                  {t('addScanReceipt')}
                </button>
                <span className="add-receipt-actions__sep" aria-hidden>·</span>
                <button type="button" className="add-receipt-actions__link" onClick={() => galleryInputRef.current?.click()}>
                  {t('addChooseGallery')}
                </button>
              </div>
            ) : null}
          </div>

          <div className={`field${hasAmount && !hasCategory ? ' field--highlight' : ''}`}>
            <div className="field__label-row">
              <span className="field__label">{t('addCategoryLabel')}</span>
              <button
                type="button"
                className="field__label-action"
                onClick={() => setShowCategories(true)}
              >
                {t('addManage')}
              </button>
            </div>
            <div className="category-slider" role="listbox" aria-label={t('addCategoryLabel')}>
              {vm.categories.map((cat) => (
                <button
                  key={cat.id}
                  ref={vm.form.categoryId === cat.id ? selectedCategoryRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={vm.form.categoryId === cat.id}
                  className={`category-slider__item ${vm.form.categoryId === cat.id ? 'category-slider__item--active' : ''}`}
                  style={{ '--cat-color': colorIntToHex(cat.colorInt) } as CSSProperties}
                  onClick={() => {
                    hapticLight();
                    vm.setForm((f) => ({ ...f, categoryId: cat.id! }));
                  }}
                >
                  <span className="category-slider__icon" aria-hidden>
                    <CategoryLucideIcon iconName={cat.iconName} size={18} />
                  </span>
                  <span className="category-slider__name">{cat.name}</span>
                </button>
              ))}
              <button
                type="button"
                className="category-slider__item category-slider__item--add"
                aria-label={t('categoryNewTitle')}
                onClick={() => setShowNewCategory(true)}
              >
                <Plus size={20} aria-hidden />
              </button>
            </div>
          </div>

          {vm.error ? <p className="sheet__error">{vm.error}</p> : null}
        </div>

        <div className="numpad-dock numpad-dock--glass">
          <div className="numpad-dock__handle" aria-hidden />
          <div
            className={`amount-hero${vm.form.amountInput === '0' ? ' amount-hero--placeholder' : ' amount-hero--active'}`}
            aria-live="polite"
          >
            <span className="amount-hero__currency">{currencySymbol(currency)}</span>
            <span className="amount-hero__value tabular-nums">{vm.form.amountInput}</span>
          </div>
          <div className="numpad numpad--compact" aria-label={t('a11yAmountKeypad')}>
            {numpadKeys.map((key) => (
              <button
                key={key}
                type="button"
                className="numpad__key"
                aria-label={key === 'back' ? t('actionBack') : key}
                onClick={() => handleNumpadKey(key)}
              >
                {key === 'back' ? <Delete size={20} aria-hidden /> : key}
              </button>
            ))}
          </div>
          {canSave ? (
            <button
              type="button"
              className="btn btn-block sheet__save"
              style={saveStyle}
              onClick={() => void handleSave()}
              disabled={vm.saving}
            >
              {saveLabel}
            </button>
          ) : (
            <div className="sheet__save-hint" role="status">
              {!hasAmount ? t('addHintEnterAmount') : t('addHintSelectCategory')}
            </div>
          )}
        </div>
      </div>

      {receiptPreviewPath ? (
        <ReceiptPreview path={receiptPreviewPath} onClose={() => setReceiptPreviewPath(null)} />
      ) : null}

      {showCamera ? (
        <CameraScreen
          onClose={() => setShowCamera(false)}
          onCaptured={(file) => {
            setShowCamera(false);
            void vm.attachReceipt(file);
          }}
        />
      ) : null}

      {showNewCategory ? (
        <CategoryEditor
          lockTransactionType={vm.form.transactionType}
          onDismiss={() => setShowNewCategory(false)}
          onConfirm={(name, transactionType, colorInt, iconName) => {
            void (async () => {
              const maxOrder = vm.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
              const id = await expenseRepository.insertCategory({
                name,
                iconName,
                colorInt: normalizeArgbInt(colorInt),
                transactionType,
                sortOrder: maxOrder + 1,
              });
              setShowNewCategory(false);
              await vm.reload();
              vm.setForm((f) => ({ ...f, categoryId: id }));
              window.dispatchEvent(new Event('ausgegeben:data-changed'));
            })();
          }}
        />
      ) : null}

      {showDatePicker ? (
        <DatePickerSheet
          valueMillis={vm.form.dateMillis}
          onDismiss={() => setShowDatePicker(false)}
          onConfirm={(millis) => vm.setForm((f) => ({ ...f, dateMillis: millis }))}
        />
      ) : null}

      {showCategories ? (
        <CategoryManageSheet
          transactionType={vm.form.transactionType}
          onClose={() => {
            setShowCategories(false);
            void vm.reload();
          }}
        />
      ) : null}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}


function currencySymbol(currency: string): string {
  return currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
}

function typeAccentVar(type: TransactionType): string {
  switch (type) {
    case 'expense': return '--color-expense';
    case 'income': return '--color-income';
    case 'transfer': return '--color-transfer';
  }
}
