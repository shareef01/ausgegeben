import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category, TransactionType } from '@/models/types';
import { expenseRepository, EmailNotVerifiedError, UNCATEGORIZED_ID } from '@/repositories/expenseRepository';

import { CategoryIconTile, EmptyState, LoadingListSkeleton, SignatureText } from '@/components/ui';
import { useToastStore } from '@/services/toastStore';
import { CategoryLucideIcon, CATEGORY_ICON_KEYS, categoryIconLabel } from '@/components/CategoryLucideIcon';
import { IconBroom, IconDelete, IconCheck, IconClose } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { CATEGORY_COLOR_INTS, colorIntsMatch } from '@/utils/categoryStyle';
import { useTranslation, type TranslationKey } from '@/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useCssProps } from '@/utils/cssVars';

interface EditorState {
  /** null id = creating a new category */
  id: string | null;
  name: string;
  iconName: string;
  colorInt: number;
}

const DEFAULT_ICON = 'category';

type CategoryAction = 'add' | 'update' | 'delete' | 'dedupe';

function categoryErrorMessage(err: unknown, action: CategoryAction, t: (key: TranslationKey) => string): string {
  if (err instanceof EmailNotVerifiedError) return t('authVerifyRequired');
  switch (action) {
    case 'add': return t('categoryErrorAddFailed');
    case 'update': return t('categoryErrorUpdateFailed');
    case 'delete': return t('categoryErrorDeleteFailed');
    case 'dedupe': return t('categoryErrorDeduplicateFailed');
  }
}

export function CategoriesView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<TransactionType>('expense');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteLinkedCount, setDeleteLinkedCount] = useState(0);
  const [showDedupeConfirm, setShowDedupeConfirm] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => {
    setEditor((current) => {
      if (current) return null;
      onClose();
      return current;
    });
  }, [onClose]);
  useFocusTrap(!(deleteTarget || showDedupeConfirm), dialogRef, handleEscape);
  useBodyScrollLock(true);

  const reload = useCallback(async (opts?: { showSkeleton?: boolean }) => {
    if (opts?.showSkeleton !== false) setLoading(true);
    setLoadError(false);
    try {
      setCategories(await expenseRepository.getAllCategories());
    } catch (err) {
      console.error('[CategoriesView] load failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = categories.filter(
    (c) => c.transactionType === filter && c.id !== UNCATEGORIZED_ID,
  );

  const startCreate = () => {
    setEditor({ id: null, name: '', iconName: DEFAULT_ICON, colorInt: CATEGORY_COLOR_INTS[0] });
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const startEdit = (cat: Category) => {
    setEditor({ id: cat.id, name: cat.name, iconName: cat.iconName, colorInt: cat.colorInt });
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const saveEditor = async () => {
    if (!editor || saving) return;
    const name = editor.name.trim();
    if (!name) return;
    const isUpdate = Boolean(editor.id);
    setSaving(true);
    try {
      if (editor.id) {
        const existing = categories.find((c) => c.id === editor.id);
        if (existing) {
          await expenseRepository.updateCategory({
            ...existing,
            name,
            iconName: editor.iconName,
            colorInt: editor.colorInt,
          });
        }
      } else {
        const maxOrder = filtered.reduce((m, c) => Math.max(m, c.sortOrder), -1);
        await expenseRepository.insertCategory({
          name,
          iconName: editor.iconName,
          colorInt: editor.colorInt,
          transactionType: filter,
          sortOrder: maxOrder + 1,
        });
      }
      await reload({ showSkeleton: false });
      setEditor(null);
    } catch (err) {
      console.error('[CategoriesView] save failed', err);
      showToast(categoryErrorMessage(err, isUpdate ? 'update' : 'add', t));
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    try {
      const count = await expenseRepository.countExpensesForCategory(cat.id);
      setDeleteLinkedCount(count);
      setDeleteTarget(cat);
    } catch (err) {
      console.error('[CategoriesView] count linked expenses failed', err);
      showToast(categoryErrorMessage(err, 'delete', t));
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteTarget) return;
    try {
      await expenseRepository.deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteLinkedCount(0);
      await reload({ showSkeleton: false });
    } catch (err) {
      console.error('[CategoriesView] delete failed', err);
      showToast(categoryErrorMessage(err, 'delete', t));
    }
  };

  const confirmDeduplicate = async () => {
    setShowDedupeConfirm(false);
    try {
      await expenseRepository.deduplicateCategories();
      await reload({ showSkeleton: false });
      showToast(t('categoryDeduplicateDone'));
    } catch (err) {
      console.error('[CategoriesView] deduplicate failed', err);
      showToast(categoryErrorMessage(err, 'dedupe', t));
    }
  };

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] safe-overlay bg-background/80 backdrop-blur-xl flex items-center justify-center" onClick={handleEscape}>
      <div
        ref={dialogRef}
        className="card--pro max-w-2xl w-full p-8 sm:p-10 flex flex-col gap-8 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="categories-title"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between">
          <h2 id="categories-title" className="modal-title text-2xl font-extrabold tracking-tight">
            <SignatureText text={editor ? (editor.id ? t('categoryEditTitle') : t('addCategory')) : t('settingsCategories')} />
          </h2>
          <div className="flex items-center gap-3">
            {!editor ? (
              <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowDedupeConfirm(true)}
                  aria-label={t('categoryDeduplicateTitle')}
                  title={t('categoryDeduplicateTitle')}
              >
                  <IconBroom width={18} height={18} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              onClick={() => (editor ? setEditor(null) : onClose())}
              aria-label={editor ? t('actionCancel') : t('actionClose')}
            >
                <IconClose width={20} height={20} aria-hidden />
            </button>
          </div>
        </div>

        {editor ? (
          <div className="category-editor flex flex-col gap-6">
            <div className="field">
              <label htmlFor="category-name" className="field__label">{t('categoryNamePrompt')}</label>
              <input
                id="category-name"
                ref={nameInputRef}
                className="field__input"
                placeholder={t('categoryNamePrompt')}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEditor();
                }}
              />
            </div>

            <div className="field">
              <div className="field__label" id="category-icon-label">{t('categoryIconLabel')}</div>
              <div className="category-editor__icons" role="group" aria-labelledby="category-icon-label">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const selected = editor.iconName === key;
                  return (
                    <EditorIconButton
                      key={key}
                      selected={selected}
                      colorInt={editor.colorInt}
                      onClick={() => setEditor({ ...editor, iconName: key })}
                      label={categoryIconLabel(key, t)}
                    >
                      <CategoryLucideIcon iconName={key} size={19} />
                    </EditorIconButton>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <div className="field__label" id="category-color-label">{t('categoryColorLabel')}</div>
              <div className="category-editor__colors" role="group" aria-labelledby="category-color-label">
                {CATEGORY_COLOR_INTS.map((colorInt, i) => {
                  const selected = colorIntsMatch(editor.colorInt, colorInt);
                  return (
                    <ColorSwatch
                      key={colorInt}
                      color={colorIntToHex(colorInt)}
                      selected={selected}
                      label={`${t('categoryColorLabel')} ${i + 1}`}
                      onClick={() => setEditor({ ...editor, colorInt })}
                    />
                  );
                })}
              </div>
            </div>

            <div className="category-editor__preview">
              <CategoryIconTile iconName={editor.iconName} color={colorIntToHex(editor.colorInt)} size={44} />
              <span className="category-editor__preview-name">{editor.name.trim() || t('categoryNamePrompt')}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary flex-1 py-3.5 font-bold text-sm"
                disabled={!editor.name.trim() || saving}
                onClick={() => void saveEditor()}
              >
                {saving ? t('actionSaving') : t('actionSave').toLowerCase()}
              </button>
              <button type="button" className="btn btn-secondary py-3.5 px-6 text-sm" onClick={() => setEditor(null)}>
                {t('actionCancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
             <IosSegmentedControl
                aria-label={t('settingsCategories')}
                options={(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => ({
                  value: type,
                  label: typeLabel(type),
                }))}
                value={filter}
                onChange={setFilter}
              />

              <div className="flex flex-col gap-3">
                 <div className="field__label mb-3">{t('currentCategories')}</div>
                 {loading ? (
                   <LoadingListSkeleton rows={6} />
                 ) : loadError ? (
                   <EmptyState
                     title={t('errorLoadFailed')}
                     subtitle={t('errorLoadFailedHint')}
                     action={
                       <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                         {t('actionRetry')}
                       </button>
                     }
                   />
                 ) : filtered.length === 0 ? (
                   <div className="categories-empty py-10">
                     <p className="categories-empty__text">{t('categoriesEmptyForType')}</p>
                   </div>
                 ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {filtered.map((cat) => (
                      <div key={cat.id} className="card--pro p-4 flex items-center gap-4 bg-surface border border-white/5 shadow-none">
                          <button
                            type="button"
                            className="category-row-edit flex items-center gap-4 flex-1 min-w-0 text-left"
                            onClick={() => startEdit(cat)}
                            aria-label={`${t('categoryEditTitle')}: ${cat.name}`}
                          >
                            <CategoryIconTile iconName={cat.iconName} color={colorIntToHex(cat.colorInt)} />
                            <span className="flex-1 text-sm font-semibold text-on-background truncate">{cat.name}</span>
                          </button>
                          <button
                              type="button"
                              className="icon-btn icon-btn--danger"
                              onClick={() => void deleteCategory(cat)}
                              aria-label={t('actionDelete') + ' ' + cat.name}
                          >
                              <IconDelete width={18} height={18} aria-hidden />
                          </button>
                      </div>
                   ))}
                 </div>
                 )}
              </div>

              <button
                type="button"
                className="btn btn-secondary w-full py-4 font-semibold text-sm active:scale-[0.98] transition-all duration-150"
                onClick={startCreate}
                disabled={loading || loadError}
              >
                {t('addCategory').toLowerCase()}
              </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('categoryDeleteConfirm', { name: deleteTarget?.name ?? '' })}
        message={deleteTarget?.id === UNCATEGORIZED_ID
          ? (deleteLinkedCount > 0
              ? t('categoryDeleteUncategorizedLinked', { count: String(deleteLinkedCount) })
              : t('categoryDeleteUncategorizedMessage'))
          : (deleteLinkedCount > 0
              ? t('categoryDeleteLinked', { count: String(deleteLinkedCount) })
              : t('categoryDeleteMessage'))}
        onConfirm={confirmDeleteCategory}
        onCancel={() => { setDeleteTarget(null); setDeleteLinkedCount(0); }}
      />

      <ConfirmDialog
        open={showDedupeConfirm}
        title={t('categoryDeduplicateTitle')}
        message={t('categoryDeduplicateMessage')}
        confirmLabel={t('categoryDeduplicateConfirm')}
        onConfirm={confirmDeduplicate}
        onCancel={() => setShowDedupeConfirm(false)}
      />
    </div>
  );
}

function EditorIconButton({
  selected,
  colorInt,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  colorInt: number;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useCssProps<HTMLButtonElement>(
    selected ? { '--editor-accent': colorIntToHex(colorInt) } : {},
  );
  return (
    <button
      ref={ref}
      type="button"
      className={`category-editor__icon${selected ? ' category-editor__icon--selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function ColorSwatch({
  color,
  selected,
  label,
  onClick,
}: {
  color: string;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  const ref = useCssProps<HTMLButtonElement>({ '--swatch-color': color });
  return (
    <button
      ref={ref}
      type="button"
      className={`category-editor__swatch${selected ? ' category-editor__swatch--selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
    >
      {selected ? <IconCheck width={14} height={14} strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}
