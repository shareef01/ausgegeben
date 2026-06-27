import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';
import { thisMonthRange } from '@/utils/periodUtils';

const SEARCH_DEBOUNCE_MS = 250;

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [listPeriod, setListPeriod] = useState<RecordListPeriod>('this_month');
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const monthSpent = useMemo(
    () => monthExpenses.filter((e) => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  const reload = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !initialLoadDone.current) {
      setLoading(true);
    }
    const cats = await expenseRepository.getAllCategories();
    const [start, end] = thisMonthRange();
    const month = await expenseRepository.getExpensesInRange(start, end);
    const range = listPeriod === 'all_time'
      ? { startMillis: 0, endMillis: Date.now() + 86_400_000 }
      : { startMillis: start, endMillis: end };
    const list = await expenseRepository.queryExpenses({
      ...range,
      typeFilter,
      searchQuery: debouncedSearch,
    });
    setCategories(cats);
    setMonthExpenses(month);
    setExpenses(list);
    setLoading(false);
    initialLoadDone.current = true;
  }, [listPeriod, typeFilter, debouncedSearch]);

  useEffect(() => {
    void reload(!initialLoadDone.current);
  }, [reload]);

  useEffect(() => {
    const handler = () => void reload(false);
    window.addEventListener('ausgegeben:data-changed', handler);
    return () => window.removeEventListener('ausgegeben:data-changed', handler);
  }, [reload]);

  const uiState: RecordUiState = useMemo(() => ({
    expenses,
    categories,
    searchQuery,
    typeFilter,
    listPeriod,
    insights: {},
    monthlyBudget,
    monthExpenses,
    dayTotalsByLabel: {},
    loading,
  }), [expenses, categories, searchQuery, typeFilter, listPeriod, monthlyBudget, monthExpenses, loading]);

  const requestDelete = useCallback(async (id: number) => {
    const deleted = await expenseRepository.deleteExpense(id);
    if (!deleted) return;
    await reload(false);
    showToast(t('recordDeleted'), t('actionUndo'), async () => {
      await expenseRepository.restoreExpense(deleted);
      await reload(false);
    });
    setTimeout(() => {
      void receiptService.deletePath(deleted.receiptImagePath);
    }, 5500);
  }, [reload, showToast, t]);

  const duplicateExpense = useCallback(async (expense: Expense) => {
    const copiedReceipt = await receiptService.copy(expense.receiptImagePath);
    const { id: _id, ...rest } = expense;
    await expenseRepository.insertExpense({
      ...rest,
      receiptImagePath: copiedReceipt,
      dateMillis: Date.now(),
    });
    await reload(false);
    showToast(t('recordDuplicated'));
  }, [reload, showToast, t]);

  return {
    uiState,
    monthSpent,
    setSearchQuery,
    setTypeFilter,
    setListPeriod,
    requestDelete,
    duplicateExpense,
    reload,
  };
}
