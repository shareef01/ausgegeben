import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Layers, Pencil, Plus } from 'lucide-react';
import type { Category, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import {
  getCachedCategories,
  isCategoryCacheReady,
  preloadCategories,
  refreshCategoryCache,
} from '@/services/categoryCache';
import { useToastStore } from '@/services/toastStore';
import { CategoryEditor } from '@/components/CategoryEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BottomSheet } from '@/components/BottomSheet';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { colorIntToHex } from '@/utils/currency';
import { iconTintOnCategoryFill, normalizeArgbInt } from '@/utils/categoryUtils';
import { useTranslation } from '@/i18n';

interface CategoryManageSheetProps {
  transactionType: TransactionType;
  onClose: () => void;
}

export function CategoryManageSheet({ transactionType, onClose }: CategoryManageSheetProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const filterCategories = useCallback((all: Category[]) => (
    all
      .filter((c) => c.transactionType === transactionType)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  ), [transactionType]);

  const [categories, setCategories] = useState<Category[]>(() =>
    filterCategories(getCachedCategories()),
  );
  const [editorCategory, setEditorCategory] = useState<Category | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [linkedCount, setLinkedCount] = useState(-1);

  const reload = useCallback(async () => {
    const all = isCategoryCacheReady()
      ? await refreshCategoryCache()
      : await preloadCategories();
    setCategories(filterCategories(all));
  }, [filterCategories]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!deleteTarget?.id) {
      setLinkedCount(-1);
      return;
    }
    void expenseRepository.countLinkedExpenses(deleteTarget.id).then(setLinkedCount);
  }, [deleteTarget]);

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  const handleEditorConfirm = async (
    name: string,
    catType: TransactionType,
    colorInt: number,
    iconName: string,
  ) => {
    try {
      if (editorCategory === 'new') {
        const maxOrder = categories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
        await expenseRepository.insertCategory({
          name,
          iconName,
          colorInt: normalizeArgbInt(colorInt),
          transactionType: catType,
          sortOrder: maxOrder + 1,
        });
      } else if (editorCategory) {
        await expenseRepository.updateCategory({
          ...editorCategory,
          name,
          transactionType: catType,
          colorInt: normalizeArgbInt(colorInt),
          iconName,
        });
      }
      setEditorCategory(null);
      await reload();
      window.dispatchEvent(new Event('ausgegeben:data-changed'));
    } catch {
      showToast(t('errorSaveFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await expenseRepository.deleteCategory(deleteTarget);
      setDeleteTarget(null);
      await reload();
      window.dispatchEvent(new Event('ausgegeben:data-changed'));
    } catch {
      showToast(t('errorSaveFailed'));
    }
  };

  const moveCategory = async (cat: Category, up: boolean) => {
    try {
      await expenseRepository.moveCategory(cat, up);
      await reload();
    } catch {
      showToast(t('errorSaveFailed'));
    }
  };

  const linkedSuffix = () => {
    if (linkedCount < 0) return t('categoryDeleteLinkedFallback');
    if (linkedCount === 0) return t('categoryDeleteLinkedNone');
    if (linkedCount === 1) return t('categoryDeleteLinkedOne');
    return t('categoryDeleteLinkedMany', { count: String(linkedCount) });
  };

  return (
    <>
      <BottomSheet
        onClose={onClose}
        sheetClassName="sheet--category-manage"
        header={(
          <div className="category-manage__header">
            <div className="sheet__header-text">
              <h2 className="sheet__title">{t('categoryManageTitle')}</h2>
              <p className="sheet__subtitle">
                {t('categoryManageSubtitle', { type: typeLabel(transactionType), count: String(categories.length) })}
              </p>
            </div>
            <button type="button" className="btn btn-secondary category-manage__add" onClick={() => setEditorCategory('new')}>
              <Plus size={16} aria-hidden />
              {t('categoryNewTitle')}
            </button>
          </div>
        )}
      >
          {categories.length === 0 ? (
            <div className="category-manage__empty card">
              <Layers size={36} className="category-manage__empty-icon" aria-hidden />
              <p className="category-manage__empty-title">{t('categoryEmptyTitle')}</p>
              <p className="category-manage__empty-sub">{t('categoryManageEmptySubtitle')}</p>
              <p className="category-manage__empty-hint">{t('gestureTapEdit')}</p>
            </div>
          ) : (
            <div className="settings-group settings-group--glass card category-manage__list">
              {categories.map((cat, index) => {
                const color = colorIntToHex(cat.colorInt);
                const tint = iconTintOnCategoryFill(cat.colorInt);
                return (
                  <div key={cat.id} className="settings-row settings-row--static category-row">
                    <button
                      type="button"
                      className="category-row__main"
                      onClick={() => setEditorCategory(cat)}
                    >
                      <span
                        className="category-row__icon"
                        style={{ '--cat-color': color, background: `var(--aurora-glow), color-mix(in srgb, ${color} 14%, var(--glass-bg-elevated))` } as CSSProperties}
                      >
                        <CategoryLucideIcon iconName={cat.iconName} size={18} color={tint} />
                      </span>
                      <span className="settings-row__label category-row__label">
                        <span className="settings-row__title">{cat.name}</span>
                      </span>
                    </button>
                    <div className="category-row__actions">
                      <button
                        type="button"
                        className="category-row__action"
                        aria-label={t('categoryMoveUp')}
                        disabled={index === 0}
                        onClick={() => void moveCategory(cat, true)}
                      >
                        <ChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        className="category-row__action"
                        aria-label={t('categoryMoveDown')}
                        disabled={index === categories.length - 1}
                        onClick={() => void moveCategory(cat, false)}
                      >
                        <ChevronDown size={18} />
                      </button>
                      <button
                        type="button"
                        className="category-row__action"
                        aria-label={t('categoryEdit')}
                        onClick={() => setEditorCategory(cat)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="category-row__action category-row__action--delete"
                        onClick={() => setDeleteTarget(cat)}
                      >
                        {t('actionDelete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" className="btn btn-secondary btn-block category-manage__done" onClick={onClose}>
            {t('actionClose')}
          </button>
      </BottomSheet>

      {editorCategory != null ? (
        <CategoryEditor
          initialCategory={editorCategory === 'new' ? null : editorCategory}
          lockTransactionType={transactionType}
          onDismiss={() => setEditorCategory(null)}
          onConfirm={(name, type, colorInt, iconName) => void handleEditorConfirm(name, type, colorInt, iconName)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t('categoryDeleteTitle')}
          cancelLabel={t('actionCancel')}
          confirmLabel={t('actionDelete')}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        >
          {t('categoryDeleteBody', { name: deleteTarget.name, suffix: linkedSuffix() })}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
