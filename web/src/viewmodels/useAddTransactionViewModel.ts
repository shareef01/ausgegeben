import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository, UNCATEGORIZED_ID } from '@/repositories/expenseRepository';
import { formatAmountForInput, parseAmount } from '@/utils/currency';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string | null;
  note: string;
  dateMillis: number;
}

const defaultForm = (): AddTransactionForm => ({
  amountInput: '',
  transactionType: 'expense',
  categoryId: null,
  note: '',
  dateMillis: Date.now(),
});

export function useAddTransactionViewModel(expenseId?: string) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddTransactionForm>(defaultForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const CATEGORY_TIMEOUT_MS = 8000;
      const catsPromise = expenseRepository.getAllCategories();
      const timeoutPromise = new Promise<Category[]>((_, reject) =>
        setTimeout(() => reject(new Error('Category load timed out')), CATEGORY_TIMEOUT_MS)
      );
      const cats = await Promise.race([catsPromise, timeoutPromise]);
      setCategories(cats);
      if (expenseId) {
        const existing = await expenseRepository.getExpenseById(expenseId);
        if (existing) {
          setForm({
            amountInput: formatAmountForInput(existing.amount, usePreferencesStore.getState().currency),
            transactionType: existing.transactionType,
            categoryId: existing.categoryId,
            note: existing.note,
            dateMillis: existing.dateMillis,
          });
        } else {
          // The expense was deleted elsewhere (another tab/device) between opening this
          // edit view and this fetch. Without this branch the form silently stayed blank
          // with no error, and Save would happily recreate a new document under the
          // (now stale) expenseId with only the freshly-typed fields — a data-loss-adjacent
          // bug. Surface the same load-failure copy used below so the user sees an error
          // instead of a deceptively empty "Edit Transaction" form.
          setError(t('errorLoadFailed'));
        }
      } else {
        const first = cats.find((c) => c.transactionType === 'expense');
        setForm({ ...defaultForm(), categoryId: first?.id ?? null });
      }
      setReady(true);
    } catch (err) {
      console.error('[useAddTransactionViewModel] load failed', err);
      setReady(true);
      setError(t('errorLoadFailed'));
    }
  }, [expenseId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.transactionType === form.transactionType && c.name?.trim() && c.id !== UNCATEGORIZED_ID),
    [categories, form.transactionType],
  );

  useEffect(() => {
    if (!filteredCategories.some((c) => c.id === form.categoryId)) {
      setForm((f) => ({ ...f, categoryId: filteredCategories[0]?.id ?? null }));
    }
  }, [form.transactionType, filteredCategories, form.categoryId]);

  const appendDigit = (digit: string) => {
    setForm((f) => ({ ...f, amountInput: f.amountInput + digit }));
  };

  const backspace = () => setForm((f) => ({ ...f, amountInput: f.amountInput.slice(0, -1) }));

  const setAmountInput = (value: string) => {
    const sanitized = value.replace(/[^\d,.\-]/g, '');
    setForm((f) => ({ ...f, amountInput: sanitized }));
  };

  const save = async (): Promise<boolean> => {
    const amount = parseAmount(form.amountInput, usePreferencesStore.getState().currency);
    if (!amount || amount <= 0) {
      setError(t('errorValidAmount'));
      return false;
    }
    if (!form.categoryId) {
      setError(t('errorChooseCategory'));
      return false;
    }
    setSaving(true);
    setError(null);
    const payload: Omit<Expense, 'id'> = {
      amount,
      categoryId: form.categoryId,
      note: form.note.trim(),
      dateMillis: form.dateMillis,
      transactionType: form.transactionType,
    };
    const idempotencyKey = `${payload.dateMillis}-${payload.categoryId}-${payload.amount.toFixed(2)}`;
    try {
      if (expenseId) {
        await expenseRepository.updateExpense({ ...payload, id: expenseId });
      } else {
        await expenseRepository.insertExpense(payload, idempotencyKey);
      }
      return true;
    } catch (err) {
      console.error('[useAddTransactionViewModel] save failed', err);
      setError(t('errorSaveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reloadCategories = useCallback(async () => {
    try {
      const cats = await expenseRepository.getAllCategories();
      setCategories(cats);
    } catch (err) {
      console.error('[useAddTransactionViewModel] reloadCategories failed', err);
    }
  }, []);

  return {
    form,
    setForm,
    categories: filteredCategories,
    ready,
    appendDigit,
    backspace,
    setAmountInput,
    save,
    saving,
    error,
    isEditing: Boolean(expenseId),
    reloadCategories,
  };
}
