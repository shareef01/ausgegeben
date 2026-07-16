import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { CategoryIconTile, SignatureText } from '@/components/ui';
import { IconBroom, IconDelete, IconCheck, IconClose } from '@/components/Icons';
import { colorIntToHex } from '@/utils/currency';
import { useTranslation } from '@/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export function CategoriesView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<TransactionType>('expense');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteLinkedCount, setDeleteLinkedCount] = useState(0);
  const [showDedupeConfirm, setShowDedupeConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setCategories(await expenseRepository.getAllCategories());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = categories.filter((c) => c.transactionType === filter);

  const startAdd = () => {
    setAdding(true);
    setNewName('');
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  const confirmAdd = async () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    const maxOrder = filtered.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    await expenseRepository.insertCategory({
      name,
      iconName: 'shopping_bag',
      colorInt: 0xff6a9fd4,
      transactionType: filter,
      sortOrder: maxOrder + 1,
    });
    await reload();
    setAdding(false);
    setNewName('');
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName('');
  };

  const deleteCategory = async (cat: Category) => {
    const count = await expenseRepository.countExpensesForCategory(cat.id);
    setDeleteLinkedCount(count);
    setDeleteTarget(cat);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteTarget) return;
    await expenseRepository.deleteCategory(deleteTarget.id);
    setDeleteTarget(null);
    setDeleteLinkedCount(0);
    await reload();
  };

  const deduplicate = () => {
    setShowDedupeConfirm(true);
  };

  const confirmDeduplicate = async () => {
    setShowDedupeConfirm(false);
    await expenseRepository.deduplicateCategories();
    await reload();
  };

  const typeLabel = (type: TransactionType) => {
    switch (type) {
      case 'expense': return t('typeExpense');
      case 'income': return t('typeIncome');
      case 'transfer': return t('typeTransfer');
    }
  };

  const dialogRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(deleteTarget === null && !showDedupeConfirm, dialogRef, handleEscape);

  return (
    <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
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
          <h2 id="categories-title" className="text-2xl font-black tracking-tight">
            <SignatureText text={t('settingsCategories')} />
          </h2>
          <div className="flex items-center gap-3">
            <button
                type="button"
                className="w-10 h-10 rounded-full bg-surface border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-zinc-400 hover:text-white"
                onClick={() => void deduplicate()}
                aria-label={t('categoryDeduplicateTitle')}
                title={t('categoryDeduplicateTitle')}
            >
                <IconBroom width={18} height={18} aria-hidden />
            </button>
            <button type="button" className="w-10 h-10 rounded-full bg-surface border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-zinc-400 hover:text-white" onClick={onClose} aria-label={t('actionClose')}>
                <IconClose width={20} height={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-8">
           <div className="segmented" role="tablist">
              {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={filter === type}
                  className={`segmented__item ${filter === type ? 'segmented__item--active' : ''}`}
                  onClick={() => setFilter(type)}
                >
                  {typeLabel(type)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
               <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('currentCategories')}</div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 {filtered.map((cat) => (
                    <div key={cat.id} className="card--pro p-4 flex items-center gap-4 bg-surface border border-white/5 shadow-none">
                        <CategoryIconTile iconName={cat.iconName} color={colorIntToHex(cat.colorInt)} />
                        <span className="flex-1 text-sm font-semibold text-on-background truncate">{cat.name}</span>
                        <button
                            type="button"
                            className="p-2 text-expense hover:bg-expense/10 rounded-xl transition-all"
                            onClick={() => void deleteCategory(cat)}
                            aria-label={t('actionDelete') + ' ' + cat.name}
                        >
                            <IconDelete width={18} height={18} aria-hidden />
                        </button>
                    </div>
                 ))}
               </div>
            </div>

            {adding ? (
              <div className="flex items-center gap-3">
                <input
                  ref={addInputRef}
                  className="w-full px-5 py-4 bg-[#121214] border border-white/10 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#10B981] focus:border-[#10B981] transition-all"
                  placeholder={t('categoryNamePrompt')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' ? void confirmAdd() : e.key === 'Escape' ? cancelAdd() : null}
                />
                <button type="button" className="w-14 h-14 rounded-xl bg-income flex items-center justify-center hover:brightness-110 active:scale-95 transition-all duration-150" style={{ color: 'var(--color-on-income)' }} onClick={() => void confirmAdd()} aria-label={t('actionSave')}>
                    <IconCheck width={24} height={24} strokeWidth={3} aria-hidden />
                </button>
                <button type="button" className="w-14 h-14 rounded-xl bg-[#121214] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/20 transition-all" onClick={cancelAdd} aria-label={t('actionCancel')}>
                    <IconClose width={24} height={24} aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full py-4 rounded-xl bg-[#121214] border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 font-semibold text-sm active:scale-[0.98] transition-all duration-150"
                onClick={startAdd}
              >
                {t('addCategory').toLowerCase()}
              </button>
            )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('categoryDeleteConfirm', { name: deleteTarget?.name ?? '' })}
        message={deleteLinkedCount > 0
          ? t('categoryDeleteLinked', { count: String(deleteLinkedCount) })
          : t('categoryDeleteConfirm', { name: deleteTarget?.name ?? '' })}
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
