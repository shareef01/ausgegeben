package com.aus.ausgegeben.util

/**
 * Splits expense writes into batches the security rules can evaluate.
 *
 * Every expense create/update makes the rules read that expense's category (exists +
 * get) and the account-deletion marker. Firestore caps a batched write at 20 such
 * document lookups across the whole batch, so a batch that touches 10 or more distinct
 * categories is rejected outright — measured against the emulator: 9 categories commit,
 * 10 are denied. Chunking by write count alone (400) therefore failed every restore,
 * replace and rollback of a backup spanning 10+ categories, i.e. most real accounts,
 * while each individual expense was valid.
 *
 * Expenses are grouped by category so a batch stays as full as the limits allow.
 */
object ExpenseBatching {
    const val MAX_WRITES_PER_BATCH = 400

    /** One below the measured ceiling of 9, leaving room for a lease/journal update. */
    const val MAX_CATEGORIES_PER_BATCH = 8

    fun <T> chunk(
        items: List<T>,
        categoryOf: (T) -> String,
        maxWrites: Int = MAX_WRITES_PER_BATCH,
        maxCategories: Int = MAX_CATEGORIES_PER_BATCH,
    ): List<List<T>> {
        require(maxWrites > 0 && maxCategories > 0)
        val chunks = mutableListOf<List<T>>()
        var current = mutableListOf<T>()
        val categories = mutableSetOf<String>()
        for (item in items.sortedBy(categoryOf)) {
            val category = categoryOf(item)
            val newCategory = category !in categories
            if (current.size >= maxWrites || (newCategory && categories.size >= maxCategories)) {
                chunks += current
                current = mutableListOf()
                categories.clear()
            }
            current += item
            categories += category
        }
        if (current.isNotEmpty()) chunks += current
        return chunks
    }
}
