import { useCallback, useEffect, useState } from 'react';
import type { Category, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { ScreenTitle, categoryIcon } from '@/components/ui';
import { colorIntToHex } from '@/utils/currency';
import { useTranslation } from '@/i18n';

export function CategoriesView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<TransactionType>('expense');

  const reload = useCallback(async () => {
    setCategories(await expenseRepository.getAllCategories());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = categories.filter((c) => c.transactionType === filter);

  const addCategory = async () => {
    const name = prompt(t('categoryNamePrompt'));
    if (!name?.trim()) return;
    const maxOrder = filtered.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    await expenseRepository.insertCategory({
      name: name.trim(),
      iconName: 'shopping_bag',
      colorInt: 0xff6a9fd4,
      transactionType: filter,
      sortOrder: maxOrder + 1,
    });
    await reload();
  };

  const deleteCategory = async (cat: Category) => {
    if (!confirm(t('categoryDeleteConfirm', { name: cat.name }))) return;
    await expenseRepository.deleteCategory(cat.id!);
    await reload();
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
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
        <ScreenTitle title={t('settingsCategories')} />
        <div className="segmented" style={{ margin: '0 0 16px' }}>
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((type) => (
            <button key={type} type="button" className={filter === type ? 'active' : ''} onClick={() => setFilter(type)}>{typeLabel(type)}</button>
          ))}
        </div>
        <div className="settings-group" style={{ margin: '0 0 16px' }}>
          {filtered.map((cat) => (
            <div key={cat.id} className="settings-row">
              <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${colorIntToHex(cat.colorInt)} 14%, transparent)` }}>{categoryIcon(cat.iconName)}</span>
              <div className="settings-row__label"><div className="settings-row__title">{cat.name}</div></div>
              <button type="button" onClick={() => void deleteCategory(cat)} style={{ color: 'var(--color-error)' }}>{t('actionDelete')}</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => void addCategory()} style={{ width: '100%', padding: 12, borderRadius: 12, background: 'var(--color-accent)', color: '#fff' }}>{t('addCategory')}</button>
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: 8, padding: 12 }}>{t('actionClose')}</button>
      </div>
    </div>
  );
}
