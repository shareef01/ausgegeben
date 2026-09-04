import type { Category } from '@/models/types';
import { UNCATEGORIZED_ID } from '@/repositories/expenseRepository';

/**
 * Returns the categories whose `sortOrder` must change to move `category` one place
 * within its own transaction type. Returns empty array if move is impossible.
 * Mirrors Android CategoryViewModel.categoriesAfterMove.
 */
export function categoriesAfterMove(
  all: Category[],
  category: Category,
  moveUp: boolean,
): Category[] {
  const ordered = all
    .filter(
      (c) => c.transactionType === category.transactionType && c.id !== UNCATEGORIZED_ID,
    )
    .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id.localeCompare(b.id)));

  const index = ordered.findIndex((c) => c.id === category.id);
  if (index < 0) return [];
  const targetIndex = moveUp ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) return [];

  // Swap
  const temp = ordered[index];
  ordered[index] = ordered[targetIndex];
  ordered[targetIndex] = temp;

  const changed: Category[] = [];
  for (let position = 0; position < ordered.length; position++) {
    const item = ordered[position];
    if (item.sortOrder !== position) {
      changed.push({ ...item, sortOrder: position });
    }
  }
  return changed;
}
