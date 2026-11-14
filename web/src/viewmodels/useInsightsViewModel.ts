import { thisMonthRange } from '@/utils/periodUtils';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, InsightsUiState, Expense } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import {
  computeAllTimeAverages,
  computeCashFlowTrend,
  computePeriodInsights,
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
  // Everything below that depends on "today" is keyed on it, so a tab left open past
  // midnight (or into a new month) moves on instead of staying on the day it opened.
  const today = useLocalDay();
  const periodKey = useMemo(() => normalizeAnalyticsPeriodKey(storedPeriodKey, today), [storedPeriodKey, today]);
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

  const periodOptions = useMemo(() => analyticsPeriodOptions(14, today, locale), [locale, today]);
  const selectedOption = useMemo(
    () => periodOptions.find((o) => o.storageKey === periodKey) ?? periodOptions[0],
    [periodOptions, periodKey],
  );

  // Memoised by value (via a string key), not by object identity: the listeners below
  // re-subscribe whenever these change, and a past month's ranges are the same every day,
  // so only a range that really moved (the current month's "same days" cut-off, or "this
  // month" crossing into a new month) costs a fresh read.
  const rangeKey = JSON.stringify(analyticsDateRangeMillis(periodKey, today));
  const range = useMemo(() => JSON.parse(rangeKey) as [number, number] | null, [rangeKey]);
  const priorPeriodKey = JSON.stringify(previousPeriodRange(periodKey, today));
  const priorPeriod = useMemo(
    () => JSON.parse(priorPeriodKey) as ReturnType<typeof previousPeriodRange>,
    [priorPeriodKey],
  );

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

    // `today` rather than Date.now(): these only need the day (in progress?, tomorrow's
    // cut-off, day of month), and it makes the cards recompute when the date changes.
    const { comparison, pace, categoryMovers } = range
      ? computePeriodInsights(expenses, priorExpenses, categories, range, monthlyBudget, today)
      : { comparison: null, pace: null, categoryMovers: [] };

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
      comparisonToDate: priorPeriod?.toDate ?? false,
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
    priorPeriod,
    today,
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
