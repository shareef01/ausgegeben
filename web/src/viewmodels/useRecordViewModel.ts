import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';
import { computeDayTotals, isExpense } from '@/utils/analytics';
import { thisMonthRange } from '@/utils/periodUtils';

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [listPeriod, setListPeriod] = useState<RecordListPeriod>('this_month');
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const monthSpent = useMemo(
    () => monthExpenses.filter(isExpense).reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const cats = await expenseRepository.getAllCategories();
    const [start, end] = thisMonthRange();
    const month = await expenseRepository.getExpensesInRange(start, end);
    const range = listPeriod === 'all_time' ? { startMillis: 0, endMillis: Number.MAX_SAFE_INTEGER } : { startMillis: start, endMillis: end };
    const list = await expenseRepository.queryExpenses({
      ...range,
      typeFilter,
      searchQuery,
    });
    setCategories(cats);
    setMonthExpenses(month);
    setExpenses(list);
    setLoading(false);
  }, [listPeriod, typeFilter, searchQuery]);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener('ausgegeben:data-changed', handler);
    return () => window.removeEventListener('ausgegeben:data-changed', handler);
  }, [reload]);

  const dayTotalsByLabel = useMemo(() => computeDayTotals(expenses), [expenses]);

  const uiState: RecordUiState = {
    expenses,
    categories,
    searchQuery,
    typeFilter,
    listPeriod,
    insights: {},
    monthlyBudget,
    monthExpenses,
    dayTotalsByLabel,
    loading,
  };

  const requestDelete = useCallback(async (id: number) => {
    const deleted = await expenseRepository.deleteExpense(id);
    if (!deleted) return;
    await reload();
    showToast(t('recordDeleted'), t('actionUndo'), async () => {
      await expenseRepository.restoreExpense(deleted);
      await reload();
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
    await reload();
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
