/**
 * Splits expense writes into batches the security rules can evaluate.
 *
 * Every expense create/update makes the rules read that expense's category (exists +
 * get) and the account-deletion marker. Firestore caps a batched write at 20 such
 * document lookups across the whole batch, so a batch touching 10 or more distinct
 * categories is rejected outright — measured against the emulator: 9 categories commit,
 * 10 are denied. Chunking by write count alone (400) therefore failed every restore,
 * replace and rollback of a backup spanning 10+ categories, i.e. most real accounts,
 * while each individual expense was valid. Mirrors Android's ExpenseBatching.
 *
 * Expenses are grouped by category so a batch stays as full as the limits allow.
 */
export const EXPENSE_BATCH_MAX_WRITES = 400;
/** One below the measured ceiling of 9, leaving room for a lease/journal update. */
export const EXPENSE_BATCH_MAX_CATEGORIES = 8;

export function chunkExpensesForRules<T extends { categoryId: string }>(
  items: readonly T[],
  maxWrites = EXPENSE_BATCH_MAX_WRITES,
  maxCategories = EXPENSE_BATCH_MAX_CATEGORIES,
): T[][] {
  const sorted = [...items].sort((a, b) =>
    a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0,
  );
  const chunks: T[][] = [];
  let current: T[] = [];
  const categories = new Set<string>();
  for (const item of sorted) {
    const isNewCategory = !categories.has(item.categoryId);
    if (current.length >= maxWrites || (isNewCategory && categories.size >= maxCategories)) {
      chunks.push(current);
      current = [];
      categories.clear();
    }
    current.push(item);
    categories.add(item.categoryId);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
