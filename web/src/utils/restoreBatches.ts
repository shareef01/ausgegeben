/**
 * Batch budgeting for Firestore writes issued under `firestore.rules`.
 *
 * A batched write may make at most **20 document-access calls for the whole batch**
 * (`get`, `getAfter`, `exists`, `existsAfter`) — not per operation. Repeated access to the
 * same document within one request is cached and counted once. Three rules spend from
 * that budget:
 *
 *  - `accountAcceptsWrites()` reads `meta/accountDeletion` once per batch — 1 call;
 *  - an *expense* write reads its category (`exists` + two `get`s on one document), so a
 *    batch spanning N distinct categories costs 2N;
 *  - a category whose `transactionType` is not `"expense"` spends one call on
 *    `existsAfter(categoryBudgets/{id})` (firestore.rules:568). An `expense` category
 *    short-circuits that check at L568 and costs nothing.
 *
 * All of these numbers were measured against the emulator, not reasoned about: nine
 * expense categories pass and ten fail; 19 income categories pass and 20 fail.
 *
 * Mirrors app/src/main/java/com/aus/ausgegeben/util/RestoreBatches.kt — keep both in sync.
 */

/** Document-access calls a single batched write may make. Measured, not documented-only. */
export const RESTORE_BATCH_MAX_DOCUMENT_ACCESS = 20;

/**
 * Headroom kept for the shared `meta/accountDeletion` read and for future rule additions:
 * 16 per-row checks + 1 shared read = 17 of the 20 available.
 */
export const RESTORE_BATCH_RESERVED_ACCESS = 4;
export const RESTORE_BATCH_MAX_BUDGET_CHECKS =
  RESTORE_BATCH_MAX_DOCUMENT_ACCESS - RESTORE_BATCH_RESERVED_ACCESS;

/** Distinct categories an expense batch may span: 2 calls each, so eight (17 of 20). */
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

/**
 * Splits `rows` into batches of at most `maxRows` rows in which at most `maxChecks` rows
 * need an extra document access. A row for which `needsBudgetCheck` is false is free, so a
 * long run of expense categories is never split by this limit — only by `maxRows`.
 *
 * Category restore used to chunk by row count alone (`slice(i, i + 400)`), which is correct
 * only while an account has fewer income/transfer categories than the rules' access budget
 * allows per batch. Past that, the whole batch — and therefore the restore — failed with
 * PERMISSION_DENIED, and because rollback writes categories the same way, recovery failed
 * too. See AUD-001.
 */
export function chunkByBudgetCheck<T>(
  rows: readonly T[],
  maxRows: number,
  maxChecks: number = RESTORE_BATCH_MAX_BUDGET_CHECKS,
  needsBudgetCheck: (row: T) => boolean,
): T[][] {
  if (maxRows < 1) throw new Error('maxRows must be positive');
  if (maxChecks < 1) throw new Error('maxChecks must be positive');
  const chunks: T[][] = [];
  let current: T[] = [];
  let checks = 0;
  for (const row of rows) {
    const costs = needsBudgetCheck(row);
    if (current.length > 0 && (current.length >= maxRows || (costs && checks >= maxChecks))) {
      chunks.push(current);
      current = [];
      checks = 0;
    }
    current.push(row);
    if (costs) checks += 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
