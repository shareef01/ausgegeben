import type { Category, Expense } from '@/models/types';

function roundAmount(amt: number): number {
  return Math.round(amt * 100) / 100;
}

/**
 * Allowlisted category write. Mirrors Android AppRepository.categoryPayload():
 * never spread a Firestore snapshot — legacy keys (cloudId, deleted) stay on the
 * document via merge, and unknown extras must not be sent (rules hasOnly).
 */
export function categoryWritePayload(
  cat: Pick<Category, 'name' | 'iconName' | 'colorInt' | 'transactionType' | 'sortOrder'> & {
    id?: string;
  },
  updatedAt: number,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: cat.name.trim().slice(0, 80),
    iconName: cat.iconName,
    colorInt: cat.colorInt,
    transactionType: cat.transactionType,
    sortOrder: cat.sortOrder,
    updatedAt,
  };
  if (cat.id) payload.id = cat.id;
  return payload;
}

/**
 * Allowlisted expense write. Mirrors Android AppRepository.expensePayload().
 */
export function expenseWritePayload(
  expense: Pick<Expense, 'amount' | 'dateMillis' | 'categoryId' | 'note' | 'transactionType'> & {
    id?: string;
  },
  opts?: { updatedAt?: number; idempotencyKey?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amount: roundAmount(expense.amount),
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    note: expense.note.trim().slice(0, 2000),
    transactionType: expense.transactionType,
    updatedAt: opts?.updatedAt ?? Date.now(),
  };
  if (expense.id) payload.id = expense.id;
  if (opts?.idempotencyKey) payload.idempotencyKey = opts.idempotencyKey;
  return payload;
}
