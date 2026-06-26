import { useCallback, useEffect, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { receiptService } from '@/services/receiptService';
import { parseAmount } from '@/utils/currency';
import { useTranslation } from '@/i18n';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: number | null;
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

export function useAddTransactionViewModel(expenseId?: number) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddTransactionForm>(defaultForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousReceiptPath, setPreviousReceiptPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cats = await expenseRepository.getAllCategories();
    setCategories(cats);
    if (expenseId) {
      const all = await expenseRepository.getAllExpenses();
      const existing = all.find((e) => e.id === expenseId);
      if (existing) {
        setPreviousReceiptPath(existing.receiptImagePath ?? null);
        setForm({
          amountInput: existing.amount.toFixed(2).replace('.', ','),
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
  }, [expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = categories.filter((c) => c.transactionType === form.transactionType);

  useEffect(() => {
    if (!filteredCategories.some((c) => c.id === form.categoryId)) {
      setForm((f) => ({ ...f, categoryId: filteredCategories[0]?.id ?? null }));
    }
  }, [form.transactionType, filteredCategories, form.categoryId]);

  const appendDigit = (digit: string) => {
    setForm((f) => ({ ...f, amountInput: f.amountInput + digit }));
  };

  const backspace = () => setForm((f) => ({ ...f, amountInput: f.amountInput.slice(0, -1) }));

  const attachReceipt = async (file: File) => {
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
    if (expenseId) {
      await expenseRepository.updateExpense({ ...payload, id: expenseId });
      if (previousReceiptPath && previousReceiptPath !== form.receiptImagePath) {
        await receiptService.deletePath(previousReceiptPath, expenseId);
      }
    } else {
      await expenseRepository.insertExpense(payload);
    }
    setSaving(false);
    return true;
  };

  return {
    form,
    setForm,
    categories: filteredCategories,
    appendDigit,
    backspace,
    attachReceipt,
    removeReceipt,
    save,
    saving,
    error,
    isEditing: Boolean(expenseId),
  };
}
