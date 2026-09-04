import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository, EmailNotVerifiedError, UNCATEGORIZED_ID } from '@/repositories/expenseRepository';
import { formatAmount, formatAmountForInput, parseAmount } from '@/utils/currency';
import { thisMonthRange } from '@/utils/periodUtils';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string | null;
  note: string;
  dateMillis: number;
}

export type SaveResult = { ok: false } | { ok: true; budgetAlert?: string };

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
  /** Edit load failed (missing doc / fetch error) — block Save so we never recreate the id. */
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * Held across retries of the same logical submission, and cleared once one lands.
   *
   * Minting this inside save() made the mechanism inert: every attempt carried a brand
   * new key, so insertExpense's dedupe lookup could never match and simply cost one
   * guaranteed-empty query per insert. Reusing it means a retry after a lost response
   * finds the document the first attempt already wrote instead of duplicating it.
   */
  const pendingIdempotencyKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
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
          setLoadFailed(true);
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
      setLoadFailed(Boolean(expenseId));
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

  const checkBudgetAlert = async (
    type: TransactionType,
    newAmount: number,
    excludeExpenseId?: string,
  ): Promise<string | undefined> => {
    if (type !== 'expense') return undefined;
    const { monthlyBudget, currency } = usePreferencesStore.getState();
    if (!monthlyBudget || monthlyBudget <= 0) return undefined;
    const [start, end] = thisMonthRange();
    // Exclude the just-saved expense so we can project spent + newAmount without double-counting.
    const spent = await expenseRepository.sumMonthExpenses(start, end, excludeExpenseId);
    const projected = spent + newAmount;
    if (projected <= monthlyBudget) return undefined;
    return t('errorBudgetExceeded', {
      spent: formatAmount(projected, currency),
      budget: formatAmount(monthlyBudget, currency),
    });
  };

  const save = async (): Promise<SaveResult> => {
    if (loadFailed) {
      setError(t('errorLoadFailed'));
      return { ok: false };
    }
    const amount = parseAmount(form.amountInput, usePreferencesStore.getState().currency);
    if (!amount || amount <= 0) {
      setError(t('errorValidAmount'));
      return { ok: false };
    }
    if (!form.categoryId) {
      setError(t('errorChooseCategory'));
      return { ok: false };
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
    if (!pendingIdempotencyKey.current) {
      pendingIdempotencyKey.current = crypto.randomUUID();
    }
    const idempotencyKey = pendingIdempotencyKey.current;
    try {
      const savedId = expenseId
        ? (await expenseRepository.updateExpense({ ...payload, id: expenseId }), expenseId)
        : await expenseRepository.insertExpense(payload, idempotencyKey);
      pendingIdempotencyKey.current = null;
      // Budget check is best-effort — a failed projection must not look like a failed save.
      let budgetAlert: string | undefined;
      try {
        budgetAlert = await checkBudgetAlert(form.transactionType, amount, savedId);
      } catch (err) {
        console.error('[useAddTransactionViewModel] budget check failed', err);
        budgetAlert = t('errorBudgetCheckFailed');
      }
      return { ok: true, budgetAlert };
      } catch (err) {
      console.error('[useAddTransactionViewModel] save failed', err);
      if (err instanceof Error && err.message === 'EXPENSE_NOT_FOUND') {
        setLoadFailed(true);
        setError(t('errorLoadFailed'));
      } else {
        setError(err instanceof EmailNotVerifiedError ? t('authVerifyRequired') : t('errorSaveFailed'));
      }
      return { ok: false };
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
    loadFailed,
    isEditing: Boolean(expenseId),
    reloadCategories,
    reload: load,
  };
}
