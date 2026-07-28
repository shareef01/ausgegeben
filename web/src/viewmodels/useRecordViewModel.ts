import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository, EmailNotVerifiedError } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useTranslation, getLocale, localeTag } from '@/i18n';
import { thisMonthRange, analyticsDateRangeMillis } from '@/utils/periodUtils';

const SEARCH_DEBOUNCE_MS = 300;
const DATA_CHANGED_EVENT = 'ausgegeben:data-changed';

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

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
    setLoading(true);
    setLoadError(false);
    setDataTruncated(false);
    let catsReady = false;
    let listReady = false;
    let budgetReady = viewingCurrentMonth;
    const tryReady = () => {
      if (catsReady && listReady && budgetReady) setLoading(false);
    };

    const unsubCats = expenseRepository.onCategoriesChanged((cats) => {
      setCategories(cats);
      catsReady = true;
      tryReady();
    });

    let unsubList = () => {};
    let unsubBudget = () => {};

    if (listRange) {
      unsubList = expenseRepository.onExpensesInRange(listRange[0], listRange[1], (exps, error) => {
        setPeriodExpenses(exps);
        setDataTruncated(false);
        setLoadError(Boolean(error));
        if (viewingCurrentMonth) setMonthBudgetExpenses(exps);
        listReady = true;
        tryReady();
      });
    } else {
      // all_time: one-shot fetch (no perpetual full-collection listener)
      const loadAll = () => {
        void expenseRepository.getAllExpensesCapped(5_000).then(({ items: exps, truncated }) => {
          setPeriodExpenses(exps);
          setDataTruncated(truncated);
          setLoadError(false);
          listReady = true;
          tryReady();
        }).catch((err) => {
          console.error('[useRecordViewModel] getAllExpenses failed', err);
          setPeriodExpenses([]);
          setDataTruncated(false);
          setLoadError(true);
          listReady = true;
          tryReady();
        });
      };
      loadAll();

      const onDataChanged = () => {
        void expenseRepository.getAllExpensesCapped(5_000).then(({ items: exps, truncated }) => {
          setPeriodExpenses(exps);
          setDataTruncated(truncated);
          setLoadError(false);
        }).catch((err) => {
          console.error('[useRecordViewModel] getAllExpenses refresh failed', err);
          setLoadError(true);
        });
      };
      window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
      unsubList = () => window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
    }

    if (!viewingCurrentMonth) {
      const [start, end] = thisMonthRange();
      unsubBudget = expenseRepository.onExpensesInRange(start, end, (exps, error) => {
        setMonthBudgetExpenses(exps);
        if (error) setLoadError(true);
        budgetReady = true;
        tryReady();
      });
    }

    return () => {
      unsubCats();
      unsubList();
      unsubBudget();
    };
  }, [listPeriod, listRange, viewingCurrentMonth]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const cats = await expenseRepository.getAllCategories();
      setCategories(cats);
      if (listRange) {
        const exps = await expenseRepository.getExpensesInRange(listRange[0], listRange[1]);
        setPeriodExpenses(exps);
        setDataTruncated(false);
        if (viewingCurrentMonth) setMonthBudgetExpenses(exps);
      } else {
        const { items, truncated } = await expenseRepository.getAllExpensesCapped(5_000);
        setPeriodExpenses(items);
        setDataTruncated(truncated);
      }
      if (!viewingCurrentMonth) {
        const [start, end] = thisMonthRange();
        setMonthBudgetExpenses(await expenseRepository.getExpensesInRange(start, end));
      }
    } catch (err) {
      console.error('[useRecordViewModel] reload failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [listRange, viewingCurrentMonth]);

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

  const filteredExpenses = useMemo(() => {
    let list = periodExpenses.filter((e) => !softDeletedIds.has(e.id));

    if (typeFilter !== 'all') {
      list = list.filter(e => e.transactionType === typeFilter);
    }

    const tag = localeTag(getLocale());
    const sq = debouncedSearch.trim().toLocaleLowerCase(tag);
    if (sq) {
      const catMap = new Map(categories.map(c => [c.id, c]));
      list = list.filter(e => {
        const cat = catMap.get(e.categoryId);
        return e.note.toLocaleLowerCase(tag).includes(sq) ||
          String(e.amount).includes(sq) ||
          (cat?.name.toLocaleLowerCase(tag).includes(sq) ?? false);
      });
    }

    return list;
  }, [periodExpenses, softDeletedIds, typeFilter, debouncedSearch, categories]);

  const uiState: RecordUiState = useMemo(() => ({
    expenses: filteredExpenses,
    categories,
    searchQuery,
    typeFilter,
    listPeriod,
    insights: {},
    monthlyBudget,
    monthExpenses,
    dayTotalsByLabel: {},
    loading,
    loadError,
    dataTruncated,
  }), [filteredExpenses, categories, searchQuery, typeFilter, listPeriod, monthlyBudget, monthExpenses, loading, loadError, dataTruncated]);

  const requestDelete = useCallback(async (id: string) => {
    if (!id || softDeletedIdsRef.current.has(id)) return;
    // Soft-hide immediately; commit to Firestore only if the toast is not undone.
    setSoftDeletedIds((prev) => new Set(prev).add(id));
    showToast(
      t('recordDeleted'),
      t('actionUndo'),
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      () => {
        void expenseRepository.deleteExpense(id).then((deleted) => {
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (!deleted) {
            showToast(t('errorDeleteFailed'));
          }
        }).catch((err) => {
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
  }, [showToast, t]);

  const duplicateExpense = useCallback(async (expense: Expense) => {
    try {
      const { id: _id, ...rest } = expense;
      await expenseRepository.insertExpense({
        ...rest,
        dateMillis: Date.now(),
      });
      showToast(t('recordDuplicated'));
    } catch (err) {
      console.error('[useRecordViewModel] duplicate failed', err);
      showToast(err instanceof EmailNotVerifiedError ? t('authVerifyRequired') : t('errorDuplicateFailed'));
    }
  }, [showToast, t]);

  return {
    uiState,
    monthSpent,
    viewingCurrentMonth,
    setSearchQuery,
    setTypeFilter,
    setListPeriod,
    requestDelete,
    duplicateExpense,
    reload,
  };
}
