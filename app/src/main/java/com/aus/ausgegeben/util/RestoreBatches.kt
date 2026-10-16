package com.aus.ausgegeben.util

/**
 * Firestore rules may touch at most 20 distinct documents per batched write. Every
 * expense write reads its category (exists + get), so a batch spanning ten or more
 * categories is rejected whole with PERMISSION_DENIED, however few rows it holds.
 * Measured against the emulator: nine categories pass, ten fail. Eight leaves room.
 */
object RestoreBatches {
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
}
