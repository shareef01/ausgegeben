import { useCallback, useEffect, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { parseAmount } from '@/utils/currency';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: number | null;
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

export function useAddTransactionViewModel(expenseId?: number) {
  const [form, setForm] = useState<AddTransactionForm>(defaultForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cats = await expenseRepository.getAllCategories();
    setCategories(cats);
    if (expenseId) {
      const all = await expenseRepository.getAllExpenses();
      const existing = all.find((e) => e.id === expenseId);
      if (existing) {
        setForm({
          amountInput: existing.amount.toFixed(2).replace('.', ','),
          transactionType: existing.transactionType,
          categoryId: existing.categoryId,
          note: existing.note,
          dateMillis: existing.dateMillis,
        });
      }
    } else {
      const first = cats.find((c) => c.transactionType === 'expense');
      setForm({ ...defaultForm(), categoryId: first?.id ?? null });
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

  const save = async (): Promise<boolean> => {
    const amount = parseAmount(form.amountInput);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return false;
    }
    if (!form.categoryId) {
      setError('Choose a category');
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
    if (expenseId) {
      await expenseRepository.updateExpense({ ...payload, id: expenseId });
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
    allCategories: categories,
    appendDigit,
    backspace,
    save,
    saving,
    error,
    isEditing: Boolean(expenseId),
  };
}
