package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExpenseBatchingTest {
    private data class Row(val id: String, val categoryId: String)

    private fun rows(categories: Int, perCategory: Int) =
        (0 until categories * perCategory).map { Row("e$it", "cat-${it % categories}") }

    @Test
    fun everyBatchStaysWithinWriteAndCategoryLimits() {
        val items = rows(17, 30)
        val chunks = ExpenseBatching.chunk(items, { it.categoryId })
        for (chunk in chunks) {
            assertTrue(chunk.size <= ExpenseBatching.MAX_WRITES_PER_BATCH)
            assertTrue(chunk.map { it.categoryId }.toSet().size <= ExpenseBatching.MAX_CATEGORIES_PER_BATCH)
        }
        assertEquals(items.map { it.id }.sorted(), chunks.flatten().map { it.id }.sorted())
    }

    @Test
    fun splitsOnWriteCountWhenOneCategoryIsLarge() {
        assertEquals(listOf(400, 50), ExpenseBatching.chunk(rows(1, 450), { it.categoryId }).map { it.size })
    }

    @Test
    fun packsFewCategoriesIntoOneBatch() {
        assertEquals(1, ExpenseBatching.chunk(rows(8, 10), { it.categoryId }).size)
        assertEquals(2, ExpenseBatching.chunk(rows(9, 10), { it.categoryId }).size)
        assertEquals(0, ExpenseBatching.chunk(emptyList<Row>(), { it.categoryId }).size)
    }
}
