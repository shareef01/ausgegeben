import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, DashboardUiState, Expense } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { computeCashFlowTrend, groupByCategory } from '@/utils/analytics';
import { analyticsDateRangeMillis, analyticsPeriodOptions } from '@/utils/periodUtils';

const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

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

  const range = useMemo(() => analyticsDateRangeMillis(periodKey), [periodKey]);

  // Live categories + period-scoped expenses (Spark-safe: no full-collection listener)
  useEffect(() => {
    if (!initialLoadDone.current) setLoading(true);

    let catsReady = false;
    let expsReady = false;
    const tryReady = () => {
      if (catsReady && expsReady) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    };

    const unsubCats = expenseRepository.onCategoriesChanged((cats) => {
      setCategories(cats);
      catsReady = true;
      tryReady();
    });

    let unsubExps = () => {};

    if (range) {
      unsubExps = expenseRepository.onExpensesInRange(range[0], range[1], (items) => {
        setExpenses(items);
        expsReady = true;
        tryReady();
      });
    } else {
      const loadAll = () => {
        void expenseRepository.getAllExpenses().then((items) => {
          setExpenses(items);
          expsReady = true;
          tryReady();
        }).catch((err) => {
          console.error('[useDashboardViewModel] getAllExpenses failed', err);
          setExpenses([]);
          expsReady = true;
          tryReady();
        });
      };
      loadAll();
      const onDataChanged = () => loadAll();
      window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
      unsubExps = () => window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
    }

    return () => {
      unsubCats();
      unsubExps();
    };
  }, [range, periodKey]);

  const reload = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !initialLoadDone.current) setLoading(true);
    const cats = await expenseRepository.getAllCategories();
    const items = range
      ? await expenseRepository.getExpensesInRange(range[0], range[1])
      : await expenseRepository.getAllExpenses();
    setCategories(cats);
    setExpenses(items);
    setLoading(false);
    initialLoadDone.current = true;
  }, [range]);

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
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalTransfers: Math.round(totalTransfers * 100) / 100,
      expensesByCategory,
      incomeByCategory,
      transfersByCategory,
      cashFlowTrend: computeCashFlowTrend(expenses),
      loading,
    };
  }, [expenses, periodKey, selectedOption.label, loading]);

  return { uiState, categories, periodOptions, setAnalyticsPeriod, reload };
}
