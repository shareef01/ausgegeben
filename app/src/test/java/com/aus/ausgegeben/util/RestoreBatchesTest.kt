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

    // ── AUD-001: category batches are limited by document-access cost, not row count ──

    private data class Row(val id: String, val transactionType: String)

    private fun rows(expense: Int, other: Int) =
        (0 until expense).map { Row("e$it", "expense") } +
            (0 until other).map { Row("o$it", if (it % 2 == 0) "income" else "transfer") }

    private fun RestoreBatches.chunks(rows: List<Row>) =
        chunkByBudgetCheck(rows, 400) { it.transactionType != "expense" }

    @Test
    fun `never puts more non-expense rows in one batch than the rules can afford`() {
        for (others in listOf(19, 20, 25, 50, 100)) {
            val input = rows(0, others)
            val chunks = RestoreBatches.chunks(input)
            chunks.forEach { chunk ->
                assertTrue(
                    "batch of ${chunk.size} carries $others non-expense rows",
                    chunk.count { it.transactionType != "expense" } <= RestoreBatches.MAX_BUDGET_CHECKS,
                )
            }
            assertEquals(input, chunks.flatten())
            assertEquals(
                "splitting must not reorder or drop rows ($others rows)",
                input.map { it.id },
                chunks.flatten().map { it.id },
            )
        }
    }

    @Test
    fun `splits 25 non-expense rows as 16 plus 9 and 19 as 16 plus 3`() {
        assertEquals(listOf(16, 9), RestoreBatches.chunks(rows(0, 25)).map { it.size })
        assertEquals(listOf(16, 3), RestoreBatches.chunks(rows(0, 19)).map { it.size })
        assertEquals(
            listOf(RestoreBatches.MAX_BUDGET_CHECKS),
            RestoreBatches.chunks(rows(0, RestoreBatches.MAX_BUDGET_CHECKS)).map { it.size },
        )
    }

    @Test
    fun `expense rows are free so a wide mixed batch is not split`() {
        val input = rows(expense = 30, other = 10)
        assertEquals(listOf(40), RestoreBatches.chunks(input).map { it.size })
    }

    @Test
    fun `row cap still applies independently of the access budget`() {
        val input = rows(expense = 9, other = 0)
        val chunks = RestoreBatches.chunkByBudgetCheck(input, 4) { it.transactionType != "expense" }
        assertEquals(listOf(4, 4, 1), chunks.map { it.size })
    }

    @Test
    fun `a budget of one check per batch splits every checked row`() {
        val input = rows(expense = 2, other = 3)
        val chunks = RestoreBatches.chunkByBudgetCheck(input, 400, 1) { it.transactionType != "expense" }
        assertEquals(listOf(3, 1, 1), chunks.map { it.size })
        assertEquals(input.map { it.id }, chunks.flatten().map { it.id })
    }

    @Test
    fun `the measured ceiling is 20 document accesses with four reserved`() {
        assertEquals(20, RestoreBatches.MAX_DOCUMENT_ACCESS)
        assertEquals(16, RestoreBatches.MAX_BUDGET_CHECKS)
        assertTrue(RestoreBatches.MAX_BUDGET_CHECKS < RestoreBatches.MAX_DOCUMENT_ACCESS)
    }

    @Test
    fun `empty input yields no chunk`() {
        assertEquals(emptyList<List<Row>>(), RestoreBatches.chunks(emptyList()))
    }
}
