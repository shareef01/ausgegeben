/**
 * Firestore rules may touch at most 20 distinct documents per batched write. Every
 * expense write reads its category (exists + get), so a batch spanning ten or more
 * categories is rejected whole with PERMISSION_DENIED, however few rows it holds.
 * Measured against the emulator: nine categories pass, ten fail. Eight leaves room.
 */
export const RESTORE_BATCH_MAX_CATEGORIES = 8;

/** Splits rows into batches of at most `maxRows` rows and `maxCategories` distinct categories. */
export function chunkByCategory<T extends { categoryId: string }>(
  rows: readonly T[],
  maxRows: number,
  maxCategories: number = RESTORE_BATCH_MAX_CATEGORIES,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let categories = new Set<string>();
  for (const row of rows) {
    const opensCategory = !categories.has(row.categoryId);
    if (current.length >= maxRows || (opensCategory && categories.size >= maxCategories)) {
      chunks.push(current);
      current = [];
      categories = new Set();
    }
    current.push(row);
    categories.add(row.categoryId);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
