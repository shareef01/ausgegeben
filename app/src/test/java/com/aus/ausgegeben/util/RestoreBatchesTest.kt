package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RestoreBatchesTest {

    @Test
    fun `keeps every batch under the category cap`() {
        val rows = (0 until 40).map { "e$it" to "c${it % 17}" }
        val chunks = RestoreBatches.chunkByCategory(rows, 400, 8) { it.second }
        chunks.forEach { chunk -> assertTrue(chunk.map { it.second }.toSet().size <= 8) }
        assertEquals(rows, chunks.flatten())
    }

    @Test
    fun `keeps every batch under the row cap`() {
        val rows = (0 until 9).map { "e$it" to "c1" }
        assertEquals(listOf(4, 4, 1), RestoreBatches.chunkByCategory(rows, 4, 8) { it.second }.map { it.size })
    }

    @Test
    fun `returns no batches for no rows`() {
        assertEquals(emptyList<List<String>>(), RestoreBatches.chunkByCategory(emptyList<String>(), 400) { it })
    }
}
