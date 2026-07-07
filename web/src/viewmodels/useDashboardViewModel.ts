import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, DashboardUiState, Expense } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import {
  getCachedCategories,
  isCategoryCacheReady,
  preloadCategories,
} from '@/services/categoryCache';
import { receiptService } from '@/services/receiptService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { t } from '@/i18n';
import { hapticSuccess } from '@/utils/haptics';
import { cloudRefreshThenReload } from '@/utils/cloudRefresh';
import { computeCashFlowTrend, groupByCategory } from '@/utils/analytics';
import {
  analyticsDateRangeMillis,
  analyticsPeriodOptionFromStorage,
  analyticsPeriodOptions,
} from '@/utils/periodUtils';

export function useDashboardViewModel() {
  const periodKey = usePreferencesStore((s) => s.analyticsPeriod);
  const setAnalyticsPeriod = usePreferencesStore((s) => s.setAnalyticsPeriod);
  const [categories, setCategories] = useState<Category[]>(() => getCachedCategories());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(() => !isCategoryCacheReady());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const periodOptions = useMemo(() => analyticsPeriodOptions(24), []);
  const selectedOption = useMemo(
    () => analyticsPeriodOptionFromStorage(periodKey),
    [periodKey],
  );

  const reload = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !initialLoadDone.current) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const cats = isCategoryCacheReady()
        ? getCachedCategories()
        : await preloadCategories();
      const range = analyticsDateRangeMillis(periodKey);
      const items = range
        ? await expenseRepository.getExpensesInRange(range[0], range[1])
        : await expenseRepository.getAllExpenses();
      setCategories(cats);
      setExpenses(items);
      void receiptService.prefetch(items.map((e) => e.receiptImagePath));
      initialLoadDone.current = true;
    } catch {
      setLoadError(t('errorLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [periodKey]);

  useEffect(() => {
    void reload(!initialLoadDone.current);
  }, [reload]);

  useEffect(() => {
    const handler = () => void reload(false);
    window.addEventListener('ausgegeben:data-changed', handler);
    return () => window.removeEventListener('ausgegeben:data-changed', handler);
  }, [reload]);

  const refreshFromCloud = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const result = await cloudRefreshThenReload(() => reload(false));
      if (!result.ok) {
        setLoadError(result.error ?? t('errorLoadFailed'));
        return;
      }
      hapticSuccess();
    } catch {
      setLoadError(t('errorLoadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, reload]);

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
      loadError,
    };
  }, [expenses, periodKey, selectedOption.label, loading, loadError]);

  return { uiState, categories, periodOptions, setAnalyticsPeriod, reload, refreshFromCloud, refreshing };
}
