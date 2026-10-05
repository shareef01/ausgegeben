import { useEffect, useMemo, useRef, useState } from 'react';
import { expenseRepository } from '@/repositories/expenseRepository';
import { categoryBudgetRepository, categoryBudgetProgress, budgetAllocation } from '@/services/categoryBudgets';
import { useCategoryBudgets } from '@/viewmodels/useCategoryBudgets';
import { useTranslation } from '@/i18n';
import { usePreferencesStore } from '@/services/preferencesStore';
import { CategoryIconTile } from '@/components/ui';
import { formatAmount, colorIntToHex } from '@/utils/currency';
import { parseRecordAmount } from '@/viewmodels/useRecordViewModel';
import type { Category, Expense } from '@/models/types';

export function CategoryBudgetManager() {
  const { t } = useTranslation();
  const { uid, rows, incomplete } = useCategoryBudgets();
  const currency = usePreferencesStore(s => s.currency), globalBudget = usePreferencesStore(s => s.monthlyBudget);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState(''), [threshold, setThreshold] = useState('80'), [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState(false), [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    setCategories([]); setSelected(null);
    const stop = expenseRepository.onCategoriesChanged(c => { if (alive) setCategories(c.filter(x => x.transactionType === 'expense' && !x.migrationState)); });
    return () => { alive = false; stop(); };
  }, [uid]);
  const categoryIds = useMemo(() => new Set(categories.map(c => c.id)), [categories]);
  useEffect(() => { if (selected && !categoryIds.has(selected)) setSelected(null); }, [categoryIds, selected]);
  const budgetsById = useMemo(() => new Map(rows.map(b => [b.categoryId, b])), [rows]);
  const eligibleBudgets = rows.filter(b => categoryIds.has(b.categoryId));
  const allocation = budgetAllocation(eligibleBudgets, globalBudget);
  const parsed = parseRecordAmount(amount, currency), percent = Number(threshold);
  const valid = parsed != null && parsed > 0 && parsed < 1e9 && /^\d+$/.test(threshold) && percent >= 1 && percent <= 100;
  const save = async (remove = false) => {
    if (!uid || !selected) return;
    setSaving(true); setError(false);
    try {
      await categoryBudgetRepository.save(uid, remove ? null : { categoryId: selected, monthlyLimit: parsed!, warningThresholdPercent: percent, updatedAt: Date.now() }, selected, revision);
      setSelected(null); editorTrigger.current?.focus();
    } catch { setError(true); } finally { setSaving(false); }
  };
  return <section className="card settings-budget-edit category-budgets" aria-label={t('categoryBudgetTitle')}>
    <h2>{t('categoryBudgetTitle')}</h2><p>{t('categoryBudgetRepeat')}</p>
    <p>{t('categoryBudgetAllocated')}: {formatAmount(allocation.total, currency)}{allocation.unallocated != null ? ` · ${t('categoryBudgetUnallocated')}: ${formatAmount(allocation.unallocated, currency)}` : ''}</p>
    {allocation.overAllocated > 0 && <p role="status">{t('categoryBudgetAbove')}: {formatAmount(allocation.overAllocated, currency)}</p>}
    {incomplete && <p role="status">{t('categoryBudgetIncomplete')}</p>}
    {!rows.length && <p>{t('categoryBudgetEmpty')}</p>}
    <div className="settings-budget-edit__actions">{categories.map(c => {
      const b = budgetsById.get(c.id);
      return <button type="button" className="btn btn-secondary" key={c.id} onClick={e => { editorTrigger.current = e.currentTarget; setSelected(c.id); setAmount(b ? String(b.monthlyLimit) : ''); setThreshold(String(b?.warningThresholdPercent ?? 80)); setRevision(b?.updatedAt ?? null); setError(false); }}>{c.name}{b ? ` · ${formatAmount(b.monthlyLimit, currency)} · ${b.warningThresholdPercent}%` : ''}</button>;
    })}</div>
    {selected && <form className="settings-budget-edit" onSubmit={e => { e.preventDefault(); void save(); }}>
      <h3>{categories.find(c => c.id === selected)?.name}</h3>
      <label className="field">{t('categoryBudgetLimit')}<input autoFocus className="field__input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? "category-budget-error" : undefined} /></label>
      <label className="field">{t('categoryBudgetThreshold')}<input className="field__input" inputMode="numeric" value={threshold} onChange={e => setThreshold(e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? "category-budget-error" : undefined} /></label>
      {!valid && <p id="category-budget-error">{t('categoryBudgetInvalid')}</p>}{error && <p role="alert">{t('categoryBudgetConflict')}</p>}
      <div className="settings-budget-edit__actions"><button className="btn btn-primary" disabled={!valid || saving}>{t('actionSave')}</button>
      <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save(true)}>{t('categoryBudgetRemove')}</button>
      <button type="button" className="btn btn-secondary" onClick={() => { setSelected(null); editorTrigger.current?.focus(); }}>{t('actionCancel')}</button></div>
    </form>}
  </section>;
}

export function CategoryBudgetInsights({ categories, expenses, incomplete, onManage }: { onManage?: () => void; categories: Category[]; expenses: Expense[]; incomplete: boolean }) {
  const { t } = useTranslation();
  const state = useCategoryBudgets();
  const currency = usePreferencesStore(s => s.currency);
  const progress = useMemo(() => categoryBudgetProgress(state.rows, categories, expenses), [state.rows, categories, expenses]);
  const cached = incomplete || state.incomplete;
  return <section className="card settings-budget-edit category-budgets" aria-label={t('categoryBudgetTitle')}>
    <h2>{t('categoryBudgetTitle')}</h2><p>{t('categoryBudgetCurrent')}</p>
    {cached && <p role="status">{t('categoryBudgetIncomplete')}</p>}
    {!progress.length && <><p>{t('categoryBudgetEmpty')}</p>{onManage && <button className="btn btn-secondary" onClick={onManage}>{t('categoryBudgetTitle')}</button>}</>}
    {progress.map(p => <div className="settings-budget-edit" key={p.categoryId}>
      <CategoryIconTile iconName={p.category.iconName} color={colorIntToHex(p.category.colorInt)} size={32} /><h3>{p.category.name}</h3><p>{t('categoryBudgetSpent')}: {formatAmount(p.spent, currency)} / {formatAmount(p.monthlyLimit, currency)} · {Math.round(p.percent)}%</p>
      <progress aria-label={p.category.name} max="100" value={Math.min(100, p.percent)} />
      {(!cached || p.state !== 'normal') && <p>{t(p.state === 'over' ? 'categoryBudgetOver' : p.state === 'reached' ? 'categoryBudgetReached' : p.state === 'warning' ? 'categoryBudgetWarning' : 'categoryBudgetNormal')}</p>}
      <p>{t(p.overspent > 0 ? 'categoryBudgetOverspent' : 'categoryBudgetRemaining')}: {formatAmount(p.overspent || p.remaining, currency)}</p>
    </div>)}
  </section>;
}
