import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter, TransactionSortOrder } from '@/models/types';
import { expenseRepository, EmailNotVerifiedError } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useTranslation, type Locale } from '@/i18n';
import { thisMonthRange, analyticsDateRangeMillis } from '@/utils/periodUtils';
import { computeDayTotals, topExpenseCategoryName } from '@/utils/analytics';
import { duplicateExpensePayload } from '@/utils/duplicateExpense';

import { toMinorUnits } from '@/utils/money';
import { parseAmount } from '@/utils/currency';
import { useAuthStore } from '@/services/authStore';


export function parseRecordAmount(input: string, currency = 'EUR'): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(input.trim())) return null;
  const amount = parseAmount(input.trim(), currency);
  return amount != null && Number.isSafeInteger(toMinorUnits(amount)) ? amount : null;
}

export function resolveCompatibleCategoryFilter(
  currentCategoryId: string | null,
  nextType: TransactionTypeFilter,
  categories: Category[],
): string | null {
  if (!currentCategoryId) return null;
  if (nextType === 'all') return currentCategoryId;
  const currentCat = categories.find((c) => c.id === currentCategoryId);
  return currentCat && currentCat.transactionType === nextType ? currentCategoryId : null;
}

export function resolveCompatibleCategoryFilters(
  currentCategoryIds: string[],
  nextType: TransactionTypeFilter,
  categories: Category[],
): string[] {
  if (!currentCategoryIds.length) return [];
  const catMap = new Map(categories.map((c) => [c.id, c]));
  if (nextType === 'all') {
    return currentCategoryIds.filter((id) => catMap.has(id));
  }
  return currentCategoryIds.filter((id) => {
    const cat = catMap.get(id);
    return cat && cat.transactionType === nextType;
  });
}

export function filterRecordExpenses(params: {
  expenses: Expense[];
  typeFilter: TransactionTypeFilter;
  categoryIdFilter?: string | null;
  categoryIdsFilter?: string[];
  searchQuery?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  sortOrder?: import('@/models/types').TransactionSortOrder;
  categories: Category[];
  locale?: Locale;
}): Expense[] {
  const {
    expenses,
    typeFilter,
    categoryIdFilter,
    categoryIdsFilter,
    searchQuery = '',
    minAmount,
    maxAmount,
    sortOrder = 'date_desc',
    categories,
  } = params;
  for (const bound of [minAmount, maxAmount]) {
    if (bound != null && (!Number.isFinite(bound) || bound < 0 || !Number.isSafeInteger(toMinorUnits(bound)))) return [];
  }
  let list = expenses;

  // 1. Transaction Type Filter
  if (typeFilter !== 'all') {
    list = list.filter((e) => e.transactionType === typeFilter);
  }

  // 2. Category Filter (multi-select with single fallback)
  const selectedCats = categoryIdsFilter ?? (categoryIdFilter ? [categoryIdFilter] : []);
  if (selectedCats.length > 0) {
    const catSet = new Set(selectedCats);
    list = list.filter((e) => catSet.has(e.categoryId));
  }

  // 3. Amount Range (minor units to prevent float precision issues)
  const hasMin = minAmount != null && !isNaN(minAmount) && minAmount >= 0;
  const hasMax = maxAmount != null && !isNaN(maxAmount) && maxAmount >= 0;
  if (hasMin || hasMax) {
    const minMinor = hasMin ? toMinorUnits(minAmount) : null;
    const maxMinor = hasMax ? toMinorUnits(maxAmount) : null;

    if (minMinor != null && maxMinor != null && minMinor > maxMinor) {
      return []; // Invalid range: min > max produces empty result
    }

    list = list.filter((e) => {
      const eMinor = toMinorUnits(e.amount);
      if (minMinor != null && eMinor < minMinor) return false;
      if (maxMinor != null && eMinor > maxMinor) return false;
      return true;
    });
  }

  // 4. Text Search
  const sq = searchQuery.trim().toLowerCase();
  if (sq) {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    list = list.filter((e) => {
      const cat = catMap.get(e.categoryId);
      return (
        e.note.toLowerCase().includes(sq) ||
        (cat?.name.toLowerCase().includes(sq) ?? false)
      );
    });
  }

  // 5. Deterministic Sorting with Tie-breaking (only when sortOrder is provided)
  if (sortOrder) {
    return [...list].sort((a, b) => {
      const aMinor = toMinorUnits(a.amount);
      const bMinor = toMinorUnits(b.amount);
      switch (sortOrder) {
        case 'date_asc': {
          if (a.dateMillis !== b.dateMillis) return a.dateMillis - b.dateMillis;
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        }
        case 'amount_desc': {
          if (bMinor !== aMinor) return bMinor - aMinor;
          if (b.dateMillis !== a.dateMillis) return b.dateMillis - a.dateMillis;
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        }
        case 'amount_asc': {
          if (aMinor !== bMinor) return aMinor - bMinor;
          if (b.dateMillis !== a.dateMillis) return b.dateMillis - a.dateMillis;
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        }
        case 'date_desc': {
          if (b.dateMillis !== a.dateMillis) return b.dateMillis - a.dateMillis;
          return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        }
      }
    });
  }

  return list;
}

export function useRecordViewModel() {
  const locale = usePreferencesStore((s) => s.locale);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearch = searchQuery.trim();
  const userId = useAuthStore(s => s.user?.uid);
  const owner = useRef(userId);
  const currency = usePreferencesStore(s => s.currency);
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [categoryIdsFilter, setCategoryIdsFilterState] = useState<string[]>([]);
  const [minAmountInput, setMinAmountInput] = useState('');
  const [maxAmountInput, setMaxAmountInput] = useState('');
  const minAmount = minAmountInput.trim() ? parseRecordAmount(minAmountInput, currency) : null;
  const maxAmount = maxAmountInput.trim() ? parseRecordAmount(maxAmountInput, currency) : null;
  const amountError = (!!minAmountInput.trim() && (minAmount == null || minAmount < 0))
    || (!!maxAmountInput.trim() && (maxAmount == null || maxAmount < 0))
    || (minAmount != null && maxAmount != null && toMinorUnits(minAmount) > toMinorUnits(maxAmount));
  const setMinAmount = (value: number | null) => setMinAmountInput(value == null ? '' : String(value));
  const setMaxAmount = (value: number | null) => setMaxAmountInput(value == null ? '' : String(value));
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>('date_desc');
  const [listPeriod, setListPeriod] = useState<RecordListPeriod>('this_month');

  const [categories, setCategories] = useState<Category[]>([]);
  /** Expenses for the active list period (scoped query — not unbounded). */
  const [periodExpenses, setPeriodExpenses] = useState<Expense[]>([]);
  /** Always current calendar month — for budget bar when list period differs. */
  const [monthBudgetExpenses, setMonthBudgetExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dataTruncated, setDataTruncated] = useState(false);
  /** Ids hidden pending snackbar undo — Firestore delete runs only on dismiss/timeout. */
  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(() => new Set());
  const softDeletedIdsRef = useRef(softDeletedIds);
  softDeletedIdsRef.current = softDeletedIds;

  const viewingCurrentMonth = useMemo(() => {
    return listPeriod === 'this_month'
      || listPeriod === `month:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  }, [listPeriod]);

  const listRange = useMemo(() => {
    if (listPeriod === 'all_time') return null;
    return analyticsDateRangeMillis(listPeriod) ?? thisMonthRange();
  }, [listPeriod]);

  // Categories (small collection) + period-scoped expenses
  useEffect(() => {
    let alive = true;
    const switched = owner.current !== userId;
    owner.current = userId;
    setPeriodExpenses([]);
    setMonthBudgetExpenses([]);
    if (switched) { setCategories([]); resetFilters(); }
    if (switched) setSoftDeletedIds(new Set());
    setLoading(true);
    setLoadError(false);
    setDataTruncated(true);
    let catsReady = false;
    let listReady = false;
    let budgetReady = viewingCurrentMonth;
    let catsError = false;
    let listError = false;
    let budgetError = false;
    const syncLoadError = () => setLoadError(catsError || listError || budgetError);
    const tryReady = () => {
      if (catsReady && listReady && budgetReady) setLoading(false);
    };

    const unsubCats = expenseRepository.onCategoriesChanged((cats, error) => {
      if (!alive || useAuthStore.getState().user?.uid !== userId) return;
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

    let unsubBudget = () => {};
    const unsubList = expenseRepository.onRecordExpenses(listRange?.[0] ?? null, listRange?.[1] ?? null, (exps, error, incomplete) => {
      if (!alive || useAuthStore.getState().user?.uid !== userId) return;
      listError = error;
      setPeriodExpenses(exps);
      setDataTruncated(incomplete);
      if (viewingCurrentMonth) setMonthBudgetExpenses(exps);
      syncLoadError();
      listReady = true;
      tryReady();
    });

    if (!viewingCurrentMonth) {
      const [start, end] = thisMonthRange();
      unsubBudget = expenseRepository.onExpensesInRange(start, end, (exps, error) => {
        if (!alive || useAuthStore.getState().user?.uid !== userId) return;
        if (!error) setMonthBudgetExpenses(exps);
        budgetError = !!error;
        syncLoadError();
        budgetReady = true;
        tryReady();
      });
    }

    return () => {
      alive = false;
      unsubCats();
      unsubList();
      unsubBudget();
    };
  }, [userId, listPeriod, listRange, viewingCurrentMonth, reloadEpoch]);

  useEffect(() => () => {
    if (useAuthStore.getState().user?.uid !== userId) {
      useToastStore.getState().dismiss({ skipDismissCallback: true });
    }
  }, [userId]);

  const reload = useCallback(async () => { setReloadEpoch(v => v + 1); }, []);

  const monthExpenses = useMemo(
    () => monthBudgetExpenses.filter((e) => !softDeletedIds.has(e.id)),
    [monthBudgetExpenses, softDeletedIds],
  );

  const monthSpent = useMemo(
    () => {
      const raw = monthExpenses.filter((e) => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0);
      return Math.round(raw * 100) / 100;
    },
    [monthExpenses],
  );

  const summaryExpenses = useMemo(
    () => periodExpenses.filter((e) => !softDeletedIds.has(e.id)),
    [periodExpenses, softDeletedIds],
  );

  const filteredExpenses = useMemo(() => {
    return filterRecordExpenses({
      expenses: amountError ? [] : summaryExpenses,
      typeFilter,
      categoryIdsFilter,
      searchQuery: normalizedSearch,
      minAmount,
      maxAmount,
      sortOrder,
      categories,
      locale,
    });
  }, [amountError, summaryExpenses, typeFilter, categoryIdsFilter, normalizedSearch, minAmount, maxAmount, sortOrder, categories, locale]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (normalizedSearch.trim()) count++;
    if (typeFilter !== 'all') count++;
    if (categoryIdsFilter.length > 0) count++;
    if (minAmountInput.trim() || maxAmountInput.trim()) count++;
    if (sortOrder !== 'date_desc') count++;
    return count;
  }, [normalizedSearch, typeFilter, categoryIdsFilter, minAmount, maxAmount, minAmountInput, maxAmountInput, sortOrder]);

  const dayTotalsByLabel = useMemo(() => {
    const totals = computeDayTotals(summaryExpenses);
    const out: Record<string, [number, number]> = {};
    for (const [key, value] of Object.entries(totals)) {
      out[key] = [
        Math.round(value.income * 100) / 100,
        Math.round(value.expense * 100) / 100,
      ];
    }
    return out;
  }, [summaryExpenses]);

  const topExpenseCategory = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return topExpenseCategoryName(monthExpenses, names);
  }, [monthExpenses, categories]);

  useEffect(() => {
    setCategoryIdsFilterState(ids => {
      const next = resolveCompatibleCategoryFilters(ids, typeFilter, categories);
      return next.length === ids.length ? ids : next;
    });
  }, [categories, typeFilter]);

  const handleSetTypeFilter = useCallback((nextType: TransactionTypeFilter) => {
    setTypeFilter(nextType);
    setCategoryIdsFilterState((currentCatIds) =>
      resolveCompatibleCategoryFilters(currentCatIds, nextType, categories),
    );
  }, [categories]);

  const setCategoryIdFilter = useCallback((id: string | null) => {
    setCategoryIdsFilterState(id ? [id] : []);
  }, []);

  const setCategoryIdsFilter = useCallback((ids: string[]) => {
    setCategoryIdsFilterState(ids);
  }, []);

  const toggleCategoryIdFilter = useCallback((id: string) => {
    setCategoryIdsFilterState((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryIdsFilterState([]);
    setMinAmountInput('');
    setMaxAmountInput('');
    setSortOrder('date_desc');
  }, []);

  const uiState: RecordUiState = useMemo(() => ({
    expenses: owner.current === userId ? filteredExpenses : [],
    summaryExpenses: owner.current === userId ? summaryExpenses : [],
    categories: owner.current === userId ? categories : [],
    searchQuery,
    typeFilter,
    categoryIdFilter: categoryIdsFilter.length === 1 ? categoryIdsFilter[0] : null,
    categoryIdsFilter,
    minAmountFilter: minAmount,
    maxAmountFilter: maxAmount,
    sortOrder,
    activeFilterCount,
    listPeriod,
    topExpenseCategoryName: topExpenseCategory,
    monthlyBudget,
    monthExpenses: owner.current === userId ? monthExpenses : [],
    dayTotalsByLabel,
    loading: owner.current !== userId || loading,
    loadError,
    dataTruncated,
  }), [filteredExpenses, summaryExpenses, categories, searchQuery, typeFilter, categoryIdsFilter, minAmount, maxAmount, sortOrder, activeFilterCount, listPeriod, topExpenseCategory, monthlyBudget, monthExpenses, dayTotalsByLabel, loading, loadError, dataTruncated, userId]);

  const requestDelete = useCallback(async (id: string) => {
    const deletingUid = userId;
    if (!deletingUid || useAuthStore.getState().user?.uid !== deletingUid) return;
    if (!id || softDeletedIdsRef.current.has(id)) return;
    // Soft-hide immediately; commit to Firestore only if the toast is not undone.
    setSoftDeletedIds((prev) => new Set(prev).add(id));
    showToast(
      t('recordDeleted'),
      t('actionUndo'),
      () => {
        if (useAuthStore.getState().user?.uid !== deletingUid) return;
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      () => {
        if (useAuthStore.getState().user?.uid !== deletingUid) return;
        void expenseRepository.deleteExpense(id, deletingUid).then((deleted) => {
          if (useAuthStore.getState().user?.uid !== deletingUid) return;
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (!deleted) {
            showToast(t('errorDeleteFailed'));
          }
        }).catch((err) => {
          if (useAuthStore.getState().user?.uid !== deletingUid) return;
          console.error('[useRecordViewModel] delete commit failed', err);
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          showToast(err instanceof EmailNotVerifiedError ? t('authVerifyRequired') : t('errorDeleteFailed'));
        });
      },
    );
  }, [userId, showToast, t]);

  const duplicateExpense = useCallback(async (expense: Expense) => {
    if (!userId || useAuthStore.getState().user?.uid !== userId) return;
    try {
      // Narrow payload, mirroring Android's expensePayload(): the source doc
      // may carry legacy fields that must never be written, and its
      // idempotencyKey belongs to the original insert — see
      // utils/duplicateExpense.ts.
      await expenseRepository.insertExpense({
        ...duplicateExpensePayload(expense),
        dateMillis: Date.now(),
      }, undefined, userId);
      if (useAuthStore.getState().user?.uid !== userId) return;
      showToast(t('recordDuplicated'));
    } catch (err) {
      if (useAuthStore.getState().user?.uid !== userId) return;
      console.error('[useRecordViewModel] duplicate failed', err);
      showToast(err instanceof EmailNotVerifiedError ? t('authVerifyRequired') : t('errorDuplicateFailed'));
    }
  }, [userId, showToast, t]);

  return {
    uiState,
    minAmountInput, maxAmountInput, setMinAmountInput, setMaxAmountInput, amountError,
    monthSpent,
    viewingCurrentMonth,
    setSearchQuery,
    setTypeFilter: handleSetTypeFilter,
    setCategoryIdFilter,
    setCategoryIdsFilter,
    toggleCategoryIdFilter,
    setMinAmount,
    setMaxAmount,
    setSortOrder,
    resetFilters,
    setListPeriod,
    requestDelete,
    duplicateExpense,
    reload,
  };
}
