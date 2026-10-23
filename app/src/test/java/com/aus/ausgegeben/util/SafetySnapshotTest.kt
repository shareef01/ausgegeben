package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.UUID

/**
 * AUD-006: the safety snapshot is read back as authoritative state, so every one of these
 * cases must fail closed with a path-anchored code instead of defaulting a field or dropping a
 * row. The "keeps" tests pin the opposite half: a well-formed snapshot must come back complete,
 * including the legacy normalizations the writer itself produces.
 */
class SafetySnapshotTest {

    private fun id() = UUID.randomUUID().toString()

    private fun metaRow(overrides: Map<String, Any?> = emptyMap()) = mapOf<String, Any?>(
        "operationId" to "replace_1_abc",
        "chunkCount" to 1L,
        "totalExpenses" to 1L,
        "totalCategories" to 1L,
        "receiptChunkCount" to 0L,
        "totalReceipts" to 0L,
        "categories" to listOf(
            mapOf(
                "id" to id(), "name" to "Food", "iconName" to "restaurant",
                "colorInt" to -16_731_948L, "transactionType" to "expense", "sortOrder" to 0L,
            ),
        ),
    ) + overrides

    private fun expenseRow(overrides: Map<String, Any?> = emptyMap()) = mapOf<String, Any?>(
        "id" to id(),
        "amount" to 12.5,
        "dateMillis" to 1_700_000_000_000L,
        "categoryId" to "cat-1",
        "note" to "lunch",
        "transactionType" to "expense",
    ) + overrides

    /** Expenses of one chunk, with the path the reader uses in production. */
    private fun expensesOf(
        rows: List<Map<String, Any?>>? = null,
        container: Map<String, Any?> = mapOf("expenses" to rows),
    ) = SafetySnapshot.expenses(container, "chunk_0") { emptyMap() }

    private fun expectInvalid(fragment: String, block: () -> Unit) {
        try {
            block()
            fail("expected InvalidSnapshotException containing \"$fragment\"")
        } catch (e: SafetySnapshot.InvalidSnapshotException) {
            assertTrue(
                "code was \"${e.message}\", expected it to contain \"$fragment\"",
                e.message!!.contains(fragment),
            )
        }
    }

    // ── well-formed input ──────────────────────────────────────────────────────────────

    @Test
    fun `reads a complete snapshot without dropping rows`() {
        val meta = metaRow()
        val categories = SafetySnapshot.categories(meta)
        assertEquals(1, categories.size)
        SafetySnapshot.requireCount(SafetySnapshot.declaredCount(meta, "totalCategories"), categories.size, "meta.totalCategories")

        val rows = expensesOf(listOf(expenseRow(), expenseRow()))
        assertEquals(2, rows.size)
        assertEquals(12.5, rows[0].expense.amount, 0.0)
    }

    @Test
    fun `accepts the legacy normalizations the writer itself produces`() {
        // expenseFromDoc writes 0.0 / 0L / "0" for an unreadable legacy row. Refusing these
        // would block recovery for exactly the accounts the rules tolerate.
        val legacy = expenseRow(mapOf("amount" to 0.0, "dateMillis" to 0L, "categoryId" to "0"))
        val rows = expensesOf(listOf(legacy))
        assertEquals(0.0, rows[0].expense.amount, 0.0)
        assertEquals(0L, rows[0].expense.dateMillis)
        assertEquals("0", rows[0].expense.categoryId)
    }

    @Test
    fun `treats an absent optional section as empty but a wrong type as an error`() {
        assertEquals(null, SafetySnapshot.budgets(metaRow()))
        assertEquals(null, SafetySnapshot.templates(metaRow()))
        expectInvalid("categoryBudgets") {
            SafetySnapshot.budgets(mapOf("categoryBudgets" to "not-a-list"))
        }
    }

    // ── fail-closed: rows the old reader silently dropped or defaulted ───────────────

    @Test
    fun `refuses an expenses container of the wrong shape instead of reading it as empty`() {
        // Previously `as? List<Map<…>> ?: emptyList()`, i.e. a corrupt chunk read as
        // "this account had no expenses", which the rollback then enforces.
        expectInvalid("chunk_0.expenses") {
            expensesOf(container = mapOf("expenses" to mapOf("amount" to 1.0)))
        }
    }

    @Test
    fun `refuses an expense row with no id rather than skipping it`() {
        expectInvalid("chunk_0.expenses[0].id") {
            expensesOf(listOf(expenseRow(mapOf("id" to null))))
        }
    }

    @Test
    fun `refuses a missing amount rather than defaulting it to zero`() {
        expectInvalid("amount") {
            expensesOf(listOf(expenseRow(mapOf("amount" to null))))
        }
    }

    @Test
    fun `refuses a non-numeric or out-of-range amount`() {
        expectInvalid("amount") {
            expensesOf(listOf(expenseRow(mapOf("amount" to "12,50"))))
        }
        expectInvalid("amount") {
            expensesOf(listOf(expenseRow(mapOf("amount" to -1.0))))
        }
    }

    @Test
    fun `refuses a missing date rather than dating the row to 1970`() {
        expectInvalid("dateMillis") {
            expensesOf(listOf(expenseRow(mapOf("dateMillis" to null))))
        }
    }

    @Test
    fun `refuses a category with no name rather than dropping it`() {
        val meta = metaRow(
            mapOf(
                "categories" to listOf(
                    mapOf("id" to id(), "name" to "  ", "iconName" to "x", "colorInt" to 1L, "transactionType" to "expense", "sortOrder" to 0L),
                ),
            ),
        )
        expectInvalid("categories[0].name") { SafetySnapshot.categories(meta) }
    }

    @Test
    fun `refuses an unsupported transaction type and an out-of-range sort order`() {
        expectInvalid("transactionType") {
            expensesOf(listOf(expenseRow(mapOf("transactionType" to "refund"))))
        }
        val badOrder = metaRow(
            mapOf(
                "categories" to listOf(
                    mapOf("id" to id(), "name" to "X", "iconName" to "x", "colorInt" to 1L, "transactionType" to "expense", "sortOrder" to 12_000L),
                ),
            ),
        )
        expectInvalid("sortOrder") { SafetySnapshot.categories(badOrder) }
    }

    @Test
    fun `refuses an unreadable budget instead of throwing a raw cast error`() {
        // Previously `m["monthlyLimit"] as Number` → ClassCastException out of the rollback.
        expectInvalid("categoryBudgets[0].monthlyLimit") {
            SafetySnapshot.budgets(
                mapOf(
                    "categoryBudgets" to listOf(
                        mapOf("categoryId" to "c1", "monthlyLimit" to "100", "warningThresholdPercent" to 80L, "updatedAt" to 1L),
                    ),
                ),
            )
        }
    }

    @Test
    fun `refuses a malformed recurring template instead of dropping it`() {
        // Dropping it here made applyRecurringCollection(replace = true) delete the template.
        expectInvalid("recurringTemplates[0]") {
            SafetySnapshot.templates(mapOf("recurringTemplates" to listOf(mapOf("id" to id(), "amount" to null))))
        }
    }

    @Test
    fun `refuses a receipt the rules would reject instead of skipping it`() {
        val templateId = id()
        val valid = mapOf(
            "id" to "${templateId}_2026-01-01",
            "templateId" to templateId,
            "scheduledDate" to "2026-01-01",
            "expenseId" to "a".repeat(64),
            "createdAt" to 1_700_000_000_000L,
        )
        assertEquals(1, SafetySnapshot.receipts(listOf(valid), "meta.receipts").size)

        expectInvalid("createdAt") {
            SafetySnapshot.receipts(listOf(valid + ("createdAt" to 0L)), "meta.receipts")
        }
        expectInvalid("expenseId") {
            SafetySnapshot.receipts(listOf(valid + ("expenseId" to "not-a-hash")), "meta.receipts")
        }
        expectInvalid("id") {
            SafetySnapshot.receipts(listOf(valid + ("id" to "wrong_2026-01-01")), "meta.receipts")
        }
    }

    // ── declared totals: the guard against a chunk that quietly yields nothing ───────

    @Test
    fun `refuses a snapshot that declares more rows than were read`() {
        val meta = metaRow(mapOf("totalExpenses" to 5L))
        expectInvalid("snapshot declares 5 rows but 1 were read") {
            SafetySnapshot.requireCount(
                SafetySnapshot.declaredCount(meta, "totalExpenses"),
                expensesOf(listOf(expenseRow())).size,
                "meta.totalExpenses",
            )
        }
    }

    @Test
    fun `ignores an absent declared total and refuses a non-numeric one`() {
        SafetySnapshot.requireCount(null, 3, "meta.totalExpenses")
        expectInvalid("meta.totalExpenses") { SafetySnapshot.declaredCount(mapOf("totalExpenses" to "many"), "totalExpenses") }
    }

    @Test
    fun `refuses an unbounded chunk count`() {
        expectInvalid("chunkCount") { SafetySnapshot.chunkCount(mapOf("chunkCount" to 100_000L), "chunkCount") }
        assertEquals(0, SafetySnapshot.chunkCount(mapOf("receiptChunkCount" to 0L), "receiptChunkCount", default = 1))
        assertEquals(1, SafetySnapshot.chunkCount(emptyMap(), "chunkCount"))
    }

    @Test
    fun `preferences keep their documented defaults but reject writable-invalid values`() {
        val prefs = SafetySnapshot.preferences(mapOf("preferences" to mapOf("currency" to "EUR")))!!
        assertEquals("EUR", prefs.currency)
        assertEquals("en", prefs.locale)
        assertEquals(19, prefs.reminderHour)

        expectInvalid("preferences.reminderHour") {
            SafetySnapshot.preferences(mapOf("preferences" to mapOf("currency" to "EUR", "reminderHour" to 25L)))
        }
        expectInvalid("preferences.currency") {
            SafetySnapshot.preferences(mapOf("preferences" to mapOf("currency" to "eur")))
        }
    }
}
