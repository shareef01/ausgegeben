import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
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
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { EmptyState, LoadingGlassSpinner } from '@/components/ui';
import { IconAdd, IconArrowLeft, IconLayers } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { iconTintOnCategoryFill, normalizeArgbInt } from '@/utils/categoryUtils';
import { t } from '@/i18n';
import { hapticLight } from '@/utils/haptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';

const TRANSACTION_TYPES: TransactionType[] = ['expense', 'income', 'transfer'];

export function CategoriesView({
  onClose,
  lockFilter,
}: {
  onClose: () => void;
  lockFilter?: TransactionType;
}) {
  const showToast = useToastStore((s) => s.show);
  const [categories, setCategories] = useState<Category[]>(() => getCachedCategories());
  const [loading, setLoading] = useState(() => !isCategoryCacheReady());
  const [editorCategory, setEditorCategory] = useState<Category | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [linkedCount, setLinkedCount] = useState(-1);
  const pageRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!isCategoryCacheReady()) setLoading(true);
    try {
      const cats = isCategoryCacheReady()
        ? await refreshCategoryCache()
        : await preloadCategories();
      setCategories(cats);
    } catch {
      showToast(t('errorLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void reload(); }, [reload]);

  useSheetScrollLock();

  useFocusTrap(true, pageRef, onClose);

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

  const groupedSections = useMemo(() => {
    if (lockFilter) {
      const items = categories
        .filter((c) => c.transactionType === lockFilter)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return items.length > 0 ? [{ type: lockFilter, items }] : [];
    }
    return TRANSACTION_TYPES
      .map((type) => ({
        type,
        items: categories
          .filter((c) => c.transactionType === type)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .filter((section) => section.items.length > 0);
  }, [categories, lockFilter]);

  const handleEditorConfirm = async (
    name: string,
    transactionType: TransactionType,
    colorInt: number,
    iconName: string,
  ) => {
    try {
      if (editorCategory === 'new') {
        const sameType = categories.filter((c) => c.transactionType === transactionType);
        const maxOrder = sameType.reduce((m, c) => Math.max(m, c.sortOrder), -1);
        await expenseRepository.insertCategory({
          name,
          iconName,
          colorInt: normalizeArgbInt(colorInt),
          transactionType,
          sortOrder: maxOrder + 1,
        });
      } else if (editorCategory) {
        await expenseRepository.updateCategory({
          ...editorCategory,
          name,
          transactionType,
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

  const linkedSuffix = () => {
    if (linkedCount < 0) return t('categoryDeleteLinkedFallback');
    if (linkedCount === 0) return t('categoryDeleteLinkedNone');
    if (linkedCount === 1) return t('categoryDeleteLinkedOne');
    return t('categoryDeleteLinkedMany', { count: String(linkedCount) });
  };

  const moveCategory = async (cat: Category, up: boolean) => {
    try {
      await expenseRepository.moveCategory(cat, up);
      await reload();
    } catch {
      showToast(t('errorSaveFailed'));
    }
  };

  const renderRow = (cat: Category, index: number, items: Category[]) => {
    const color = colorIntToHex(cat.colorInt);
    const tint = iconTintOnCategoryFill(cat.colorInt);
    return (
      <div key={cat.id} className="settings-row settings-row--interactive category-row">
        <button
          type="button"
          className="category-row__main"
          onClick={() => setEditorCategory(cat)}
        >
          <span
            className="category-row__icon"
            style={{
              '--cat-color': color,
              background: `var(--aurora-glow), color-mix(in srgb, ${color} 14%, var(--glass-bg-elevated))`,
            } as CSSProperties}
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
            disabled={index === items.length - 1}
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
            aria-label={t('actionDelete')}
            onClick={() => setDeleteTarget(cat)}
          >
            {t('actionDelete')}
          </button>
        </div>
      </div>
    );
  };

  let listBody: ReactNode;
  if (loading) {
    listBody = <LoadingGlassSpinner label={t('loading')} />;
  } else if (categories.length === 0) {
    listBody = (
      <EmptyState
        title={t('categoryEmptyTitle')}
        subtitle={t('categoryEmptySubtitle')}
        hint={t('gestureTapEdit')}
        icon={<IconLayers width={28} height={28} />}
        action={(
          <button type="button" className="btn btn-primary" onClick={() => setEditorCategory('new')}>
            {t('categoryNewTitle')}
          </button>
        )}
      />
    );
  } else if (groupedSections.length === 0) {
    listBody = (
      <EmptyState
        title={t('categoryEmptyTitle')}
        subtitle={t('categoryEmptySubtitle')}
        icon={<IconLayers width={28} height={28} />}
        action={(
          <button type="button" className="btn btn-primary" onClick={() => setEditorCategory('new')}>
            {t('categoryNewTitle')}
          </button>
        )}
      />
    );
  } else {
    listBody = groupedSections.map(({ type, items }, sectionIndex) => (
      <section
        key={type}
        className="categories-section chart-reveal-in"
        style={{ animationDelay: `${Math.min(sectionIndex * 0.05, 0.2)}s` }}
        aria-labelledby={lockFilter ? undefined : `categories-section-${type}`}
      >
        {!lockFilter ? (
          <h3 id={`categories-section-${type}`} className="categories-section__label">{typeLabel(type)}</h3>
        ) : null}
        <div className="settings-group settings-group--glass card categories-list categories-list--section">
          {items.map((cat, index) => renderRow(cat, index, items))}
        </div>
      </section>
    ));
  }

  const page = (
    <>
      <div className="categories-page overlay overlay--categories" onClick={onClose} role="presentation">
        <div
          ref={pageRef}
          className="sheet sheet--categories sheet--transaction-premium categories-page-content"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="categories-page-title"
        >
          <header className="categories-page__header add-sheet__topbar">
            <button
              type="button"
              className="add-sheet__icon-btn insights-glass-island"
              onClick={() => { hapticLight(); onClose(); }}
              aria-label={t('actionBack')}
            >
              <IconArrowLeft width={20} height={20} aria-hidden />
            </button>
            <div className="categories-page__titles add-sheet__title">
              <h1 id="categories-page-title" className="categories-page__title">
                {lockFilter ? t('categoryManageTitle') : t('settingsCategories')}
              </h1>
            </div>
            {categories.length > 0 ? (
              <button
                type="button"
                className="add-sheet__icon-btn add-sheet__icon-btn--accent insights-glass-island"
                onClick={() => { hapticLight(); setEditorCategory('new'); }}
                aria-label={t('categoryNewTitle')}
              >
                <IconAdd width={22} height={22} aria-hidden />
              </button>
            ) : (
              <span className="add-sheet__icon-btn" style={{ opacity: 0 }} aria-hidden />
            )}
          </header>

          <div className="categories-page__body add-sheet__scroll settings-view">
            {listBody}
          </div>
        </div>
      </div>

      {editorCategory != null ? (
        <CategoryEditor
          initialCategory={editorCategory === 'new' ? null : editorCategory}
          lockTransactionType={editorCategory === 'new' && lockFilter ? lockFilter : undefined}
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

  return typeof document !== 'undefined' ? createPortal(page, document.body) : page;
}
