import type { Expense } from '../models/types';

/** Core writable fields of an expense, minus anything identity- or legacy-shaped. */
export type DuplicateExpensePayload = Pick<
  Expense,
  'amount' | 'dateMillis' | 'categoryId' | 'note' | 'transactionType'
>;

/**
 * Payload for duplicating an existing expense into a new document.
 *
 * Deliberately narrow, mirroring Android's expensePayload(): a source document
 * read from the cloud may carry legacy fields (cloudId, categoryCloudId,
 * receiptImagePath, deleted) that the rules tolerate on read but that this
 * project never writes, and its idempotencyKey belongs to the original insert
 * — copying it would give two documents one key and silently fuse their
 * retry paths.
 */
export function duplicateExpensePayload(expense: Expense): DuplicateExpensePayload {
  return {
    amount: expense.amount,
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    note: expense.note,
    transactionType: expense.transactionType,
  };
}
