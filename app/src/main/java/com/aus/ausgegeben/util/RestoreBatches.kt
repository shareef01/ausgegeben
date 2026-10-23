package com.aus.ausgegeben.util

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
 */
object RestoreBatches {
    /** Document-access calls a single batched write may make. Measured, not documented-only. */
    const val MAX_DOCUMENT_ACCESS = 20

    /**
     * Headroom kept for the shared `meta/accountDeletion` read and for future rule
     * additions: 16 per-row checks + 1 shared read = 17 of the 20 available.
     */
    const val RESERVED_ACCESS = 4
    const val MAX_BUDGET_CHECKS = MAX_DOCUMENT_ACCESS - RESERVED_ACCESS

    /** Distinct categories an expense batch may span: 2 calls each, so eight (17 of 20). */
    const val MAX_CATEGORIES = 8

    /** Splits [rows] into batches of at most [maxRows] rows and [maxCategories] distinct categories. */
    fun <T> chunkByCategory(
        rows: List<T>,
        maxRows: Int,
        maxCategories: Int = MAX_CATEGORIES,
        categoryOf: (T) -> String,
    ): List<List<T>> {
        val chunks = mutableListOf<List<T>>()
        var current = mutableListOf<T>()
        var categories = mutableSetOf<String>()
        for (row in rows) {
            val category = categoryOf(row)
            val opensCategory = category !in categories
            if (current.size >= maxRows || (opensCategory && categories.size >= maxCategories)) {
                chunks += current
                current = mutableListOf()
                categories = mutableSetOf()
            }
            current += row
            categories += category
        }
        if (current.isNotEmpty()) chunks += current
        return chunks
    }

    /**
     * Splits [rows] into batches of at most [maxRows] rows in which at most [maxChecks]
     * rows need an extra document access. A row for which [needsBudgetCheck] is false is
     * free, so a long run of expense categories is never split by this limit — only by
     * [maxRows].
     *
     * Category restore used to chunk by row count alone (`chunked(400)`), which is correct
     * only while an account has fewer income/transfer categories than the rules' access
     * budget allows per batch. Past that, the whole batch — and therefore the restore —
     * failed with PERMISSION_DENIED, and because the rollback writes categories the same
     * way, recovery failed too. See AUD-001.
     */
    fun <T> chunkByBudgetCheck(
        rows: List<T>,
        maxRows: Int,
        maxChecks: Int = MAX_BUDGET_CHECKS,
        needsBudgetCheck: (T) -> Boolean,
    ): List<List<T>> {
        require(maxRows >= 1) { "maxRows must be positive" }
        require(maxChecks >= 1) { "maxChecks must be positive" }
        val chunks = mutableListOf<List<T>>()
        var current = mutableListOf<T>()
        var checks = 0
        for (row in rows) {
            val costs = needsBudgetCheck(row)
            if (current.isNotEmpty() && (current.size >= maxRows || (costs && checks >= maxChecks))) {
                chunks += current
                current = mutableListOf()
                checks = 0
            }
            current += row
            if (costs) checks++
        }
        if (current.isNotEmpty()) chunks += current
        return chunks
    }
}
