package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.*
import org.junit.Test

class CompositeRecordFilterTest {
    private val rows = listOf(
        Expense(id="b", amount=12.5, dateMillis=2, categoryId="food", note="Coffee"),
        Expense(id="a", amount=12.5, dateMillis=2, categoryId="travel", note="coffee train"),
        Expense(id="c", amount=20.0, dateMillis=1, categoryId="salary", note="pay", transactionType="income"))
    private fun run(query: String = "", type: TransactionTypeFilter = TransactionTypeFilter.ALL,
        filter: CompositeRecordFilter = CompositeRecordFilter()) =
        filterRecords(rows, query, type, filter, mapOf("food" to "Groceries"), "EUR").map { it.id }
    @Test fun searchIsLiteralTrimmedAndTextOnly() {
        assertEquals(listOf("a", "b", "c"), run("  "))
        assertEquals(listOf("a", "b"), run(" COFF "))
        assertEquals(listOf("b"), run("groc"))
        assertTrue(run(".*").isEmpty())
        assertTrue(run("12.5").isEmpty())
    }
    @Test fun inclusiveBoundsAndOrCategoriesComposeWithAnd() {
        assertEquals(listOf("a", "b"), run("coffee", TransactionTypeFilter.EXPENSE,
            CompositeRecordFilter(setOf("food", "travel"), "12,50", "12.50")))
        assertEquals(listOf("c"), run(type=TransactionTypeFilter.INCOME))
        assertTrue(run(filter=CompositeRecordFilter(minInput="21", maxInput="20")).isEmpty())
    }
    @Test fun invalidAmountsAreExplicit() {
        listOf("-1", "abc", "12x", "1.2345", "Infinity", "1e2", "1000000000000000000000000").forEach {
            assertNull(CompositeRecordFilter(minInput=it).bounds("EUR"))
        }
        assertEquals(0L, CompositeRecordFilter(minInput="0").bounds("EUR")!!.first)
    }
    // The recurring and category-budget editors parse with bounds() and prefill with
    // formatAmountForInput, so every stored amount must round-trip, and grouped input
    // must be refused rather than read as a decimal ("1.000" was saved as 1.00).
    @Test fun editorPrefillRoundTripsAndGroupedInputIsRefused() {
        listOf("EUR", "USD", "GBP", "CHF").forEach { currency ->
            listOf(0.01, 12.5, 1500.0, 10_000_000.0, 999_999_999.99).forEach { amount ->
                val text = com.aus.ausgegeben.util.CurrencyUtils.formatAmountForInput(amount, currency)
                assertEquals("$currency $text", Math.round(amount * 100), CompositeRecordFilter(minInput=text).bounds(currency)!!.first)
            }
            listOf("1.000", "1,000", "1.234,56", "1,234.56").forEach {
                assertNull("$currency $it", CompositeRecordFilter(minInput=it).bounds(currency))
            }
        }
    }
    @Test fun allSortsHaveDeterministicTies() {
        assertEquals(listOf("a", "b", "c"), run(filter=CompositeRecordFilter(sort=RecordSort.DATE_DESC)))
        assertEquals(listOf("c", "a", "b"), run(filter=CompositeRecordFilter(sort=RecordSort.DATE_ASC)))
        assertEquals(listOf("a", "b", "c"), run(filter=CompositeRecordFilter(sort=RecordSort.AMOUNT_ASC)))
        assertEquals(listOf("c", "a", "b"), run(filter=CompositeRecordFilter(sort=RecordSort.AMOUNT_DESC)))
        assertTrue(filterRecords(emptyList(), "", TransactionTypeFilter.ALL, CompositeRecordFilter(), emptyMap(), "EUR").isEmpty())
    }
}
