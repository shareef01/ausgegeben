import { thisMonthRange } from '@/utils/periodUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, InsightsUiState, Expense } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import {
  computeAllTimeAverages,
  computeCashFlowTrend,
  computeCategoryMovers,
  computePeriodComparison,
  computeSpendingPace,
  computeTotals,
  groupByCategory,
} from '@/utils/analytics';
import {
  analyticsDateRangeMillis,
  analyticsPeriodOptions,
  normalizeAnalyticsPeriodKey,
  previousPeriodRange,
} from '@/utils/periodUtils';

const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

export function useInsightsViewModel() {
  // Normalized so legacy keys like 'this_month' resolve to a concrete month
  // option — otherwise the picker falls back to (and displays) "all time".
  const storedPeriodKey = usePreferencesStore((s) => s.analyticsPeriod);
  const periodKey = useMemo(() => normalizeAnalyticsPeriodKey(storedPeriodKey), [storedPeriodKey]);
  const setAnalyticsPeriod = usePreferencesStore((s) => s.setAnalyticsPeriod);
  const locale = usePreferencesStore((s) => s.locale);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [priorExpenses, setPriorExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [budgetIncomplete,setBudgetIncomplete] = useState(true);
  const [dataTruncated, setDataTruncated] = useState(false);
  const initialLoadDone = useRef(false);

  const periodOptions = useMemo(() => analyticsPeriodOptions(14, Date.now(), locale), [locale]);
  const selectedOption = useMemo(
    () => periodOptions.find((o) => o.storageKey === periodKey) ?? periodOptions[0],
    [periodOptions, periodKey],
  );

  const range = useMemo(() => analyticsDateRangeMillis(periodKey), [periodKey]);
  const priorPeriod = useMemo(() => previousPeriodRange(periodKey), [periodKey]);

  // Live categories + period-scoped expenses (Spark-safe: no full-collection listener)
  useEffect(() => {
    let alive = true;
    setBudgetIncomplete(true);
    if (!initialLoadDone.current) setLoading(true);
    setLoadError(false);
    setDataTruncated(false);

    let catsReady = false;
    let expsReady = false;
    let catsError = false;
    let expsError = false;
    const syncLoadError = () => setLoadError(catsError || expsError);
    const tryReady = () => {
      if (catsReady && expsReady) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    };

    const unsubCats = expenseRepository.onCategoriesChanged((cats, error) => {
      if (!alive) return;
      if (error) {
        catsError = true;
      } else {
        catsError = false;
        setCategories(cats);
      }
      syncLoadError();
      catsReady = true;
      tryReady();
    });

    let unsubExps = () => {};
    let unsubPrior = () => {};

    if (range) {
      unsubExps = expenseRepository.onRecordExpenses(range[0], range[1], (items, error, incomplete) => {
        if (!alive) return;
        setBudgetIncomplete(incomplete);
        if (error) {
          expsError = true;
        } else {
          expsError = false;
          setExpenses(items);
          setDataTruncated(false);
        }
        syncLoadError();
        expsReady = true;
        tryReady();
      });

      if (priorPeriod) {
        unsubPrior = expenseRepository.onExpensesInRange(
          priorPeriod.rangeMillis[0],
          priorPeriod.rangeMillis[1],
          (items, error) => {
            if (!alive) return;
            if (error) {
              setPriorExpenses([]);
            } else {
              setPriorExpenses(items);
            }
          },
        );
      } else {
        setPriorExpenses([]);
      }
    } else {
      setPriorExpenses([]);
      const loadAll = () => {
        void expenseRepository.getAllExpensesCapped(5_000).then(({ items, truncated }) => {
          if (!alive) return;
          expsError = false;
          setExpenses(items);
          setDataTruncated(truncated);
          syncLoadError();
          expsReady = true;
          tryReady();
        }).catch((err) => {
          if (!alive) return;
          console.error('[useInsightsViewModel] getAllExpenses failed', err);
          expsError = true;
          // Keep last good expenses (parity with Record all-time refresh).
          syncLoadError();
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
      alive = false;
      unsubCats();
      unsubExps();
      unsubPrior();
    };
  }, [range, priorPeriod, periodKey]);

  const reload = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !initialLoadDone.current) setLoading(true);
    setLoadError(false);
    try {
      const cats = await expenseRepository.getAllCategories();
      if (range) {
        if (priorPeriod) {
          const [items, priorItems] = await Promise.all([
            expenseRepository.getExpensesInRange(range[0], range[1]),
            expenseRepository.getExpensesInRange(priorPeriod.rangeMillis[0], priorPeriod.rangeMillis[1]),
          ]);
          setExpenses(items);
          setPriorExpenses(priorItems);
        } else {
          const items = await expenseRepository.getExpensesInRange(range[0], range[1]);
          setExpenses(items);
          setPriorExpenses([]);
        }
        setDataTruncated(false);
      } else {
        const { items, truncated } = await expenseRepository.getAllExpensesCapped(5_000);
        setExpenses(items);
        setPriorExpenses([]);
        setDataTruncated(truncated);
      }
      setCategories(cats);
    } catch (err) {
      console.error('[useInsightsViewModel] reload failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [range, priorPeriod]);

  const uiState: InsightsUiState = useMemo(() => {
    const expensesByCategory = groupByCategory(expenses, 'expense');
    const incomeByCategory = groupByCategory(expenses, 'income');
    const transfersByCategory = groupByCategory(expenses, 'transfer');

    const currentTotals = computeTotals(expenses);
    const priorTotals = computeTotals(priorExpenses);

    const comparison = range
      ? computePeriodComparison(
          currentTotals.totalExpenses,
          currentTotals.totalIncome,
          priorTotals.totalExpenses,
          priorTotals.totalIncome,
          priorExpenses.length > 0,
        )
      : null;

    const pace = range
      ? computeSpendingPace(currentTotals.totalExpenses, range, Date.now(), monthlyBudget)
      : null;

    const priorExpensesByCategory = groupByCategory(priorExpenses, 'expense');
    const categoryMovers = range
      ? computeCategoryMovers(expensesByCategory, priorExpensesByCategory, categories, 3)
      : [];

    const allTimeAverages = !range ? computeAllTimeAverages(expenses) : null;

    return {
      periodKey,
      periodLabel: selectedOption.label,
      totalExpenses: currentTotals.totalExpenses,
      totalIncome: currentTotals.totalIncome,
      totalTransfers: currentTotals.totalTransfers,
      expensesByCategory,
      incomeByCategory,
      transfersByCategory,
      cashFlowTrend: computeCashFlowTrend(expenses, periodKey),
      comparison,
      pace,
      categoryMovers,
      allTimeAverages,
      loading,
      loadError,
      dataTruncated,
    };
  }, [
    expenses,
    priorExpenses,
    categories,
    range,
    monthlyBudget,
    periodKey,
    selectedOption.label,
    loading,
    loadError,
    dataTruncated,
  ]);

  const currentMonth = thisMonthRange();
  const showCategoryBudgets = range?.[0] === currentMonth[0] && range?.[1] === currentMonth[1];
  return { uiState, categories, budgetExpenses: expenses, budgetIncomplete, showCategoryBudgets, periodOptions, setAnalyticsPeriod, reload };
}
