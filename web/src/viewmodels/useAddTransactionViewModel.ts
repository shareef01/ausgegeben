import { useEffect, useMemo, useState } from 'react';

import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { isCloudSyncActive } from '@/services/cloudSync';
import { receiptStorageService } from '@/services/receiptStorageService';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import {
  getCachedCategories,
  isCategoryCacheReady,
  preloadCategories,
  refreshCategoryCache,
} from '@/services/categoryCache';
import { formatAmount, parseAmount, decimalSeparator, handleNumpadKey, numpadBackspace } from '@/utils/currency';
import { t } from '@/i18n';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: number | null;
  note: string;
  dateMillis: number;
  receiptImagePath: string | null;
}

export interface SaveResult {
  ok: boolean;
  budgetAlert?: string;
}

const defaultForm = (): AddTransactionForm => ({
  amountInput: '0',
  transactionType: 'expense',
  categoryId: null,
  note: '',
  dateMillis: Date.now(),
  receiptImagePath: null,
});

function applyDefaultCategory(cats: Category[]): AddTransactionForm {
  const first = cats.find((c) => c.transactionType === 'expense');
  return { ...defaultForm(), categoryId: first?.id ?? null };
}

function applyExpenseForm(existing: NonNullable<Awaited<ReturnType<typeof expenseRepository.getExpenseById>>>): AddTransactionForm {
  return {
    amountInput: existing.amount.toFixed(2).replace('.', ','),
    transactionType: existing.transactionType,
    categoryId: existing.categoryId,
    note: existing.note,
    dateMillis: existing.dateMillis,
    receiptImagePath: existing.receiptImagePath ?? null,
  };
}

function initialForm(expenseId?: number): AddTransactionForm {
  const cats = getCachedCategories();
  if (!expenseId && cats.length > 0) return applyDefaultCategory(cats);
  return defaultForm();
}

const READ_TIMEOUT_MS = 8_000;

async function readExpenseWithTimeout(id: number): Promise<'timeout' | Expense | 'missing'> {
  const result = await Promise.race([
    expenseRepository.getExpenseById(id).then((expense) => expense ?? ('missing' as const)),
    new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), READ_TIMEOUT_MS)),
  ]);
  return result;
}

export function useAddTransactionViewModel(expenseId?: number) {
  const showToast = useToastStore((s) => s.show);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const currency = usePreferencesStore((s) => s.currency);
  const [categories, setCategories] = useState<Category[]>(() => getCachedCategories());
  const [form, setForm] = useState<AddTransactionForm>(() => initialForm(expenseId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousReceiptPath, setPreviousReceiptPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const cats = isCategoryCacheReady()
          ? getCachedCategories()
          : await preloadCategories();
        if (cancelled) return;
        setCategories(cats);

        if (expenseId) {
          const existing = await readExpenseWithTimeout(expenseId);
          if (cancelled) return;
          if (existing === 'timeout') {
            setError(t('errorLoadFailed'));
          } else if (existing === 'missing') {
            setError(t('errorExpenseNotFound'));
          } else {
            setPreviousReceiptPath(existing.receiptImagePath ?? null);
            setForm(applyExpenseForm(existing));
            if (existing.receiptImagePath) {
              void receiptService.ensureLocal(existing.receiptImagePath);
            }
          }
        } else {
          setForm((prev) => (prev.categoryId != null ? prev : applyDefaultCategory(cats)));
          setPreviousReceiptPath(null);
        }
      } catch {
        if (!cancelled) setError(t('errorLoadFailed'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.transactionType === form.transactionType && c.id !== 0 && c.name?.trim()),
    [categories, form.transactionType],
  );

  useEffect(() => {
    if (!filteredCategories.some((c) => c.id === form.categoryId)) {
      const nextId = filteredCategories[0]?.id ?? null;
      if (form.categoryId !== nextId) {
        setForm((f) => ({ ...f, categoryId: nextId }));
      }
    }
  }, [form.transactionType, filteredCategories, form.categoryId]);

  const appendDigit = (digit: string) => {
    const sep = decimalSeparator(currency);
    setForm((f) => ({ ...f, amountInput: handleNumpadKey(f.amountInput, digit, sep) }));
  };

  const backspace = () => setForm((f) => ({ ...f, amountInput: numpadBackspace(f.amountInput) }));

  const setAmountInput = (value: string) => {
    const sanitized = value.replace(/[^\d,.\-]/g, '');
    setForm((f) => ({ ...f, amountInput: sanitized }));
  };

  const reload = async () => {
    try {
      const cats = await refreshCategoryCache();
      setCategories(cats);
    } catch {
      setError(t('errorLoadFailed'));
    }
  };

  const attachReceipt = async (file: File) => {
    const path = await receiptService.save(file);
    if (form.receiptImagePath && form.receiptImagePath !== previousReceiptPath) {
      await receiptService.deletePath(form.receiptImagePath);
    }
    setForm((f) => ({ ...f, receiptImagePath: path }));
    if (isCloudSyncActive()) {
      await receiptService.uploadToCloud(path);
      if (receiptStorageService.isCloudReceiptsUnavailable()) {
        showToast(t('receiptAttachedLocalHint'));
      }
    }
  };

  const removeReceipt = async () => {
    if (form.receiptImagePath && form.receiptImagePath !== previousReceiptPath) {
      await receiptService.deletePath(form.receiptImagePath);
    }
    setForm((f) => ({ ...f, receiptImagePath: null }));
  };

  const checkBudgetAlert = async (
    type: TransactionType,
    amount: number,
    editingId?: number,
  ): Promise<string | undefined> => {
    if (type !== 'expense' || !monthlyBudget || monthlyBudget <= 0) return undefined;
    const spent = await expenseRepository.sumMonthExpenses(editingId ?? 0);
    const projected = spent + amount;
    if (projected <= monthlyBudget) return undefined;
    return t('errorBudgetExceeded', {
      projected: formatAmount(projected, currency),
      budget: formatAmount(monthlyBudget, currency),
    });
  };

  const save = async (): Promise<SaveResult> => {
    const amount = parseAmount(form.amountInput);
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
    try {
      const payload = {
        amount,
        categoryId: form.categoryId,
        note: form.note.trim(),
        dateMillis: form.dateMillis,
        transactionType: form.transactionType,
        receiptImagePath: form.receiptImagePath,
      };
      if (expenseId) {
        const existing = await expenseRepository.getExpenseById(expenseId);
        if (!existing) {
          setError(t('errorExpenseNotFound'));
          return { ok: false };
        }
        await expenseRepository.updateExpense({ ...payload, id: expenseId, cloudId: existing.cloudId });
        if (previousReceiptPath && previousReceiptPath !== form.receiptImagePath) {
          await receiptService.deletePath(previousReceiptPath, expenseId);
        }
      } else {
        await expenseRepository.insertExpense(payload);
      }
      const budgetAlert = await checkBudgetAlert(form.transactionType, amount, expenseId);
      window.dispatchEvent(new Event('ausgegeben:data-changed'));
      if (
        form.receiptImagePath
        && isCloudSyncActive()
        && receiptStorageService.isCloudReceiptsUnavailable()
      ) {
        showToast(t('receiptAttachedLocalHint'));
      }
      return { ok: true, budgetAlert };
    } catch {
      setError(t('errorSaveFailed'));
      return { ok: false };
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    setForm,
    categories: filteredCategories,
    appendDigit,
    backspace,
    setAmountInput,
    attachReceipt,
    removeReceipt,
    save,
    reload,
    saving,
    error,
    isEditing: Boolean(expenseId),
  };
}
