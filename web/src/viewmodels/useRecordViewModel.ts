import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Expense, RecordListPeriod, RecordUiState, TransactionTypeFilter } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';
import { thisMonthRange, analyticsDateRangeMillis } from '@/utils/periodUtils';

const SEARCH_DEBOUNCE_MS = 300; // SECURE: Strict debounce boundary

export function useRecordViewModel() {
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [listPeriod, setListPeriod] = useState<RecordListPeriod>('this_month');

  const [categories, setCategories] = useState<Category[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // SECURE: Mirror Android's real-time data flows
  useEffect(() => {
    let catsReady = false;
    let expsReady = false;
    const tryReady = () => {
      if (catsReady && expsReady) setLoading(false);
    };

    const unsubCats = expenseRepository.onCategoriesChanged((cats) => {
      setCategories(cats);
      catsReady = true;
      tryReady();
    });
    const unsubExps = expenseRepository.onExpensesChanged((exps) => {
      setAllExpenses(exps);
      expsReady = true;
      tryReady();
    });
    return () => { unsubCats(); unsubExps(); };
  }, []);

  const monthExpenses = useMemo(() => {
      const [start, end] = thisMonthRange();
      return allExpenses.filter(e => e.dateMillis >= start && e.dateMillis < end);
  }, [allExpenses]);

  const viewingCurrentMonth = useMemo(() => {
    return listPeriod === 'this_month' || listPeriod === `month:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  }, [listPeriod]);

  const monthSpent = useMemo(
    () => {
      const raw = monthExpenses.filter((e) => e.transactionType === 'expense').reduce((s, e) => s + e.amount, 0);
      return Math.round(raw * 100) / 100;
    },
    [monthExpenses],
  );

  const filteredExpenses = useMemo(() => {
    let list = allExpenses;

    if (listPeriod === 'this_month') {
      const [start, end] = thisMonthRange();
      list = list.filter(e => e.dateMillis >= start && e.dateMillis < end);
    } else if (listPeriod !== 'all_time') {
      const range = analyticsDateRangeMillis(listPeriod);
      if (range) {
        list = list.filter(e => e.dateMillis >= range[0] && e.dateMillis < range[1]);
      }
    }

    if (typeFilter !== 'all') {
        list = list.filter(e => e.transactionType === typeFilter);
    }

    const sq = debouncedSearch.trim().toLocaleLowerCase('en');
    if (sq) {
        const catMap = new Map(categories.map(c => [c.id, c]));
        list = list.filter(e => {
            const cat = catMap.get(e.categoryId);
            return e.note.toLocaleLowerCase('en').includes(sq) ||
                   String(e.amount).includes(sq) ||
                   (cat?.name.toLocaleLowerCase('en').includes(sq) ?? false);
        });
    }

    return list;
  }, [allExpenses, listPeriod, typeFilter, debouncedSearch, categories]);

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
  }), [filteredExpenses, categories, searchQuery, typeFilter, listPeriod, monthlyBudget, monthExpenses, loading]);

  const requestDelete = useCallback(async (id: string) => {
    try {
      const deleted = await expenseRepository.deleteExpense(id);
      if (!deleted) return;
      showToast(t('recordDeleted'), t('actionUndo'), async () => {
        await expenseRepository.restoreExpense(deleted);
      });
      // SECURE: Use longer cleanup window for offline-resilience
      setTimeout(() => {
        void receiptService.deletePath(deleted.receiptImagePath);
      }, 15000);
    } catch (err) {
      console.error('[useRecordViewModel] delete failed', err);
      showToast(t('errorDeleteFailed'));
    }
  }, [showToast, t]);

  const duplicateExpense = useCallback(async (expense: Expense) => {
    try {
      const copiedReceipt = await receiptService.copy(expense.receiptImagePath);
      const { id: _id, ...rest } = expense;
      await expenseRepository.insertExpense({
        ...rest,
        receiptImagePath: copiedReceipt,
        dateMillis: Date.now(),
      });
      showToast(t('recordDuplicated'));
    } catch (err) {
      console.error('[useRecordViewModel] duplicate failed', err);
      showToast(t('errorDuplicateFailed'));
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
  };
}
