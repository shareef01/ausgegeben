import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { parseAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';

export const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string | null;
  note: string;
  dateMillis: number;
  receiptImagePath: string | null;
}

const defaultForm = (): AddTransactionForm => ({
  amountInput: '',
  transactionType: 'expense',
  categoryId: null,
  note: '',
  dateMillis: Date.now(),
  receiptImagePath: null,
});

export function useAddTransactionViewModel(expenseId?: string) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddTransactionForm>(defaultForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousReceiptPath, setPreviousReceiptPath] = useState<string | null>(null);
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
          setPreviousReceiptPath(existing.receiptImagePath ?? null);
          setForm({
            amountInput: existing.amount.toFixed(2),
            transactionType: existing.transactionType,
            categoryId: existing.categoryId,
            note: existing.note,
            dateMillis: existing.dateMillis,
            receiptImagePath: existing.receiptImagePath ?? null,
          });
        }
      } else {
        const first = cats.find((c) => c.transactionType === 'expense');
        setForm({ ...defaultForm(), categoryId: first?.id ?? null });
        setPreviousReceiptPath(null);
      }
      setReady(true);
    } catch (err) {
      console.error('[useAddTransactionViewModel] load failed', err);
      setReady(true); // Show form even on error — let user retry
      setError(t('errorLoadFailed'));
    }
  }, [expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.transactionType === form.transactionType && c.name?.trim()),
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

  const attachReceipt = async (file: File) => {
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type) && file.type !== '') {
      setError(t('errorReceiptType'));
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE) {
      setError(t('errorReceiptTooLarge'));
      return;
    }
    setError(null);
    const path = await receiptService.save(file);
    if (form.receiptImagePath && form.receiptImagePath !== previousReceiptPath) {
      await receiptService.deletePath(form.receiptImagePath);
    }
    setForm((f) => ({ ...f, receiptImagePath: path }));
  };

  const removeReceipt = async () => {
    if (form.receiptImagePath && form.receiptImagePath !== previousReceiptPath) {
      await receiptService.deletePath(form.receiptImagePath);
    }
    setForm((f) => ({ ...f, receiptImagePath: null }));
  };

  const save = async (): Promise<boolean> => {
    const amount = parseAmount(form.amountInput);
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
      receiptImagePath: form.receiptImagePath,
    };
    // Idempotency: client-generated key prevents double-submits on retry
    const idempotencyKey = `${payload.dateMillis}-${payload.categoryId}-${payload.amount.toFixed(2)}`;
    try {
      if (expenseId) {
        await expenseRepository.updateExpense({ ...payload, id: expenseId });
        if (previousReceiptPath && previousReceiptPath !== form.receiptImagePath) {
          await receiptService.deletePath(previousReceiptPath, expenseId);
        }
      } else {
        await expenseRepository.insertExpense(payload, idempotencyKey);
      }
      return true;
    } catch (err) {
      console.error('[useAddTransactionViewModel] save failed', err);
      setError(t('authErrorGeneric'));
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
    attachReceipt,
    removeReceipt,
    save,
    saving,
    error,
    isEditing: Boolean(expenseId),
    reloadCategories,
  };
}
