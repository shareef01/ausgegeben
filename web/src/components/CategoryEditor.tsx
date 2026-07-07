import { useEffect, useState, type CSSProperties } from 'react';
import type { Category, TransactionType } from '@/models/types';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { useTranslation } from '@/i18n';
import { colorIntToHex } from '@/utils/currency';
import {
  CATEGORY_COLOR_PALETTE_INTS,
  CATEGORY_ICON_KEYS,
  defaultIconKeyForName,
  iconTintOnCategoryFill,
  nearestPaletteColorInt,
  normalizeArgbInt,
} from '@/utils/categoryUtils';

interface CategoryEditorProps {
  initialCategory?: Category | null;
  lockTransactionType?: TransactionType;
  onDismiss: () => void;
  onConfirm: (name: string, transactionType: TransactionType, colorInt: number, iconName: string) => void;
}

export function CategoryEditor({ initialCategory, lockTransactionType, onDismiss, onConfirm }: CategoryEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialCategory?.name ?? '');
  const [transactionType, setTransactionType] = useState<TransactionType>(
    lockTransactionType ?? initialCategory?.transactionType ?? 'expense',
  );
  const [colorInt, setColorInt] = useState(
    initialCategory?.colorInt != null
      ? nearestPaletteColorInt(initialCategory.colorInt)
      : CATEGORY_COLOR_PALETTE_INTS[0],
  );
  const [iconName, setIconName] = useState(
    initialCategory?.iconName && initialCategory.iconName !== 'category'
      ? initialCategory.iconName
      : initialCategory
        ? defaultIconKeyForName(initialCategory.name)
        : 'category',
  );

  useEffect(() => {
    if (!initialCategory && name.trim() && iconName === 'category') {
      setIconName(defaultIconKeyForName(name));
    }
  }, [name, initialCategory, iconName]);

  const previewColor = colorIntToHex(colorInt);
  const previewTint = iconTintOnCategoryFill(colorInt);
  const canSave = name.trim().length > 0;
  const title = initialCategory ? t('categoryEditTitle') : t('categoryNewTitle');

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  return (
    <BottomSheet
      onClose={onDismiss}
      sheetClassName="sheet--category-editor"
      ariaLabelledBy="category-editor-title"
      header={(
        <div className="sheet--settings__header">
          <h2 id="category-editor-title" className="sheet--settings__title">{title}</h2>
          <button type="button" className="sheet--settings__close" onClick={onDismiss}>{t('actionClose')}</button>
        </div>
      )}
    >
        <div className="category-editor__body">
          <div className="category-editor__preview">
            <div className="category-editor__preview-label">{t('categoryPreview')}</div>
            <div
              className="category-editor__preview-icon"
              style={{ background: `color-mix(in srgb, ${previewColor} 18%, transparent)`, color: previewTint }}
            >
              <CategoryLucideIcon iconName={iconName} size={28} color={previewTint} />
            </div>
            <div className={`category-editor__preview-name${name.trim() ? '' : ' category-editor__preview-name--muted'}`}>
              {name.trim() || t('categoryPreviewName')}
            </div>
          </div>

          <label className="field">
            <span className="field__label">{t('categoryNameLabel')}</span>
            <input
              className="field__input category-editor__name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('categoryNamePlaceholder')}
            />
          </label>

          {!lockTransactionType ? (
            <div className="field">
              <span className="field__label">{t('categoryTypeLabel')}</span>
              <IosSegmentedControl
                options={(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => ({
                  value: type,
                  label: typeLabel(type),
                }))}
                value={transactionType}
                onChange={setTransactionType}
              />
            </div>
          ) : null}

          <div className="field">
            <span className="field__label">{t('categoryIconLabel')}</span>
            <div className="category-editor__icon-grid">
              {CATEGORY_ICON_KEYS.map((key) => {
                const selected = iconName === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`category-editor__icon-tile${selected ? ' category-editor__icon-tile--active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setIconName(key)}
                  >
                    <CategoryLucideIcon
                      iconName={key}
                      size={20}
                      color={selected ? previewTint : undefined}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <span className="field__label">{t('categoryColorLabel')}</span>
            <div className="category-editor__color-grid">
              {CATEGORY_COLOR_PALETTE_INTS.map((swatch) => {
                const selected = normalizeArgbInt(swatch) === normalizeArgbInt(colorInt);
                return (
                  <button
                    key={swatch}
                    type="button"
                    className={`category-editor__color-swatch${selected ? ' category-editor__color-swatch--active' : ''}`}
                    aria-pressed={selected}
                    style={{ '--swatch-color': colorIntToHex(swatch) } as CSSProperties}
                    onClick={() => setColorInt(swatch)}
                  />
                );
              })}
            </div>
          </div>

          {!canSave ? <p className="category-editor__hint">{t('categoryHintEnterName')}</p> : null}

          <div className="category-editor__actions">
            <button type="button" className="btn btn-secondary" onClick={onDismiss}>{t('actionCancel')}</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSave}
              onClick={() => onConfirm(name.trim(), transactionType, normalizeArgbInt(colorInt), iconName)}
            >
              {initialCategory ? t('categorySaveChanges') : t('categoryAddButton')}
            </button>
          </div>
        </div>
    </BottomSheet>
  );
}
