import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository, type ExpenseQueryParams } from '@/repositories/expenseRepository';
import {
  getCachedCategories,
  isCategoryCacheReady,
  preloadCategories,
} from '@/services/categoryCache';
import { receiptService } from '@/services/receiptService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { hapticSuccess } from '@/utils/haptics';
import { cloudRefreshThenReload } from '@/utils/cloudRefresh';
import { t } from '@/i18n';
import { computeDayTotals, computeSpendingInsights, recentWeekRangeMillis, thisMonthRange } from '@/utils/periodUtils';

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 40;

function buildListParams(
  listPeriod: RecordUiState['listPeriod'],
  typeFilter: TransactionTypeFilter,
  debouncedSearch: string,
): ExpenseQueryParams {
  const [monthStart, monthEnd] = thisMonthRange();
  const range = listPeriod === 'all_time'
    ? { startMillis: 0, endMillis: Date.now() + 86_400_000 }
    : { startMillis: monthStart, endMillis: monthEnd };
  return {
    ...range,
    typeFilter,
    searchQuery: debouncedSearch,
  };
}

function prefetchReceipts(expenses: Expense[]): void {
  void receiptService.prefetch(expenses.map((e) => e.receiptImagePath));
}

function needsFullExpenseScan(params: ExpenseQueryParams): boolean {
  return params.typeFilter !== 'all' || params.searchQuery.trim().length > 0;
}

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const listPeriod = usePreferencesStore((s) => s.recordListPeriod);
  const locale = usePreferencesStore((s) => s.locale);
  const setRecordListPeriod = usePreferencesStore((s) => s.setRecordListPeriod);
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [categories, setCategories] = useState<Category[]>(() => getCachedCategories());
  const [displayExpenses, setDisplayExpenses] = useState<Expense[]>([]);
  const [summaryTotals, setSummaryTotals] = useState({ totalExpenses: 0, totalIncome: 0 });
  const [listCount, setListCount] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [weekExpenses, setWeekExpenses] = useState<Expense[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  const filteredCacheRef = useRef<Expense[] | null>(null);
  const listParamsRef = useRef<ExpenseQueryParams | null>(null);
  const displayOffsetRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const monthSpent = useMemo(
    () => monthExpenses.filter((e) => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );

  const categoryNames = useMemo(
    () => new Map(categories.flatMap((c) => (c.id != null ? [[c.id, c.name] as const] : []))),
    [categories],
  );

  const insights = useMemo(
    () => computeSpendingInsights(monthExpenses, weekExpenses, categoryNames),
    [monthExpenses, weekExpenses, categoryNames],
  );

  const dayTotalsByLabel = useMemo(
    () => computeDayTotals(displayExpenses, locale),
    [displayExpenses, locale],
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
      const [start, end] = thisMonthRange();
      const [weekStart, weekEnd] = recentWeekRangeMillis();
      const listParams = buildListParams(listPeriod, typeFilter, debouncedSearch);
      listParamsRef.current = listParams;

      const [month, week, totals] = await Promise.all([
        expenseRepository.getExpensesInRange(start, end),
        expenseRepository.getExpensesInRange(weekStart, weekEnd),
        expenseRepository.queryExpenseTotals(listParams),
      ]);

      setSummaryTotals({ totalExpenses: totals.totalExpenses, totalIncome: totals.totalIncome });
      setListCount(totals.count);

      if (needsFullExpenseScan(listParams)) {
        const list = await expenseRepository.queryExpenses(listParams);
        filteredCacheRef.current = list;
        const firstPage = list.slice(0, PAGE_SIZE);
        setDisplayExpenses(firstPage);
        prefetchReceipts(firstPage);
        displayOffsetRef.current = Math.min(PAGE_SIZE, list.length);
        setHasMore(list.length > PAGE_SIZE);
      } else {
        filteredCacheRef.current = null;
        const page = await expenseRepository.queryExpensesPage(listParams, PAGE_SIZE, 0);
        setDisplayExpenses(page.items);
        prefetchReceipts(page.items);
        displayOffsetRef.current = page.items.length;
        setHasMore(page.hasMore);
      }

      setCategories(cats);
      setMonthExpenses(month);
      setWeekExpenses(week);
      initialLoadDone.current = true;
    } catch (e) {
      setLoadError(t('errorLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [listPeriod, typeFilter, debouncedSearch]);

  useEffect(() => {
    void reload(!initialLoadDone.current);
  }, [reload]);

  useEffect(() => {
    const handler = () => void reload(false);
    window.addEventListener('ausgegeben:data-changed', handler);
    return () => window.removeEventListener('ausgegeben:data-changed', handler);
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const listParams = listParamsRef.current;
    if (!listParams) return;

    setLoadingMore(true);
    try {
      if (filteredCacheRef.current) {
        const cache = filteredCacheRef.current;
        const offset = displayOffsetRef.current;
        const next = cache.slice(offset, offset + PAGE_SIZE);
        displayOffsetRef.current = offset + next.length;
        setDisplayExpenses((prev) => [...prev, ...next]);
        prefetchReceipts(next);
        setHasMore(displayOffsetRef.current < cache.length);
        return;
      }

      const page = await expenseRepository.queryExpensesPage(listParams, PAGE_SIZE, displayOffsetRef.current);
      displayOffsetRef.current += page.items.length;
      setDisplayExpenses((prev) => [...prev, ...page.items]);
      prefetchReceipts(page.items);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

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

  const uiState: RecordUiState = useMemo(() => ({
    displayExpenses,
    hasMore,
    listCount,
    summaryTotals,
    categories,
    searchQuery,
    typeFilter,
    listPeriod,
    insights,
    monthlyBudget,
    monthExpenses,
    dayTotalsByLabel,
    loading,
    loadingMore,
    loadError,
  }), [displayExpenses, hasMore, listCount, summaryTotals, categories, searchQuery, typeFilter, listPeriod, insights, monthlyBudget, monthExpenses, dayTotalsByLabel, loading, loadingMore, loadError]);

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
  }, [reload, showToast]);

  const duplicateExpense = useCallback(async (expense: Expense) => {
    const copiedReceipt = await receiptService.copy(expense.receiptImagePath);
    const { id: _id, ...rest } = expense;
    await expenseRepository.insertExpense({
      ...rest,
      receiptImagePath: copiedReceipt,
      dateMillis: Date.now(),
    });
    await reload(false);
    hapticSuccess();
    showToast(t('recordDuplicated'));
  }, [reload, showToast]);

  return {
    uiState,
    monthSpent,
    setSearchQuery,
    setTypeFilter,
    setListPeriod: setRecordListPeriod,
    requestDelete,
    duplicateExpense,
    loadMore,
    reload,
    refreshFromCloud,
    refreshing,
  };
}
