import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, DashboardUiState, Expense } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { computeCashFlowTrend, groupByCategory } from '@/utils/analytics';
import { analyticsDateRangeMillis, analyticsPeriodOptions } from '@/utils/periodUtils';

export function useDashboardViewModel() {
  const periodKey = usePreferencesStore((s) => s.analyticsPeriod);
  const setAnalyticsPeriod = usePreferencesStore((s) => s.setAnalyticsPeriod);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const periodOptions = useMemo(() => analyticsPeriodOptions(14), []);
  const selectedOption = useMemo(
    () => periodOptions.find((o) => o.storageKey === periodKey) ?? periodOptions[0],
    [periodOptions, periodKey],
  );

  const reload = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !initialLoadDone.current) {
      setLoading(true);
    }
    const cats = await expenseRepository.getAllCategories();
    const range = analyticsDateRangeMillis(periodKey);
    const items = range
      ? await expenseRepository.getExpensesInRange(range[0], range[1])
      : await expenseRepository.getAllExpenses();
    setCategories(cats);
    setExpenses(items);
    setLoading(false);
    initialLoadDone.current = true;
  }, [periodKey]);

  useEffect(() => {
    void reload(!initialLoadDone.current);
  }, [reload]);

  useEffect(() => {
    const handler = () => void reload(false);
    window.addEventListener('ausgegeben:data-changed', handler);
    return () => window.removeEventListener('ausgegeben:data-changed', handler);
  }, [reload]);

  const uiState: DashboardUiState = useMemo(() => {
    const expensesByCategory = groupByCategory(expenses, 'expense');
    const incomeByCategory = groupByCategory(expenses, 'income');
    const transfersByCategory = groupByCategory(expenses, 'transfer');

    let totalExpenses = 0;
    let totalIncome = 0;
    let totalTransfers = 0;
    for (const e of expenses) {
      if (e.transactionType === 'expense') totalExpenses += e.amount;
      else if (e.transactionType === 'income') totalIncome += e.amount;
      else totalTransfers += e.amount;
    }

    return {
      periodKey,
      periodLabel: selectedOption.label,
      totalExpenses,
      totalIncome,
      totalTransfers,
      expensesByCategory,
      incomeByCategory,
      transfersByCategory,
      cashFlowTrend: computeCashFlowTrend(expenses),
      loading,
    };
  }, [expenses, periodKey, selectedOption.label, loading]);

  return { uiState, categories, periodOptions, setAnalyticsPeriod, reload };
}
