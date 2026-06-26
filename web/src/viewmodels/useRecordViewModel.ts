import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { computeDayTotals } from '@/utils/analytics';
import { thisMonthRange } from '@/utils/periodUtils';

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [listPeriod, setListPeriod] = useState<RecordListPeriod>('this_month');
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

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

  return {
    uiState,
    setSearchQuery,
    setTypeFilter,
    setListPeriod,
    deleteExpense: async (id: number) => {
      await expenseRepository.deleteExpense(id);
      await reload();
    },
    duplicateExpense: async (expense: Expense) => {
      const { id: _id, ...rest } = expense;
      await expenseRepository.insertExpense({
        ...rest,
        dateMillis: Date.now(),
      });
      await reload();
    },
    reload,
  };
}
