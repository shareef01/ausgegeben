package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers buildInsightsState/insightsStatesEquivalent/categoryMapsEquivalent directly —
 * pure functions pulled out of InsightsViewModel for exactly the reason categoriesAfterMove
 * was pulled out of CategoryViewModel: the totals/rounding/grouping logic was previously
 * only reachable through the combine/flowOn/stateIn pipeline, not by a test.
 */
class InsightsStateTest {

    private val groceries = Category(id = "c1", name = "Groceries", iconName = "cart", colorInt = 1, transactionType = "expense")
    private val dining = Category(id = "c2", name = "Dining", iconName = "food", colorInt = 2, transactionType = "expense")
    private val salary = Category(id = "c3", name = "Salary", iconName = "cash", colorInt = 3, transactionType = "income")
    private val transferCat = Category(id = "c4", name = "Transfer", iconName = "swap", colorInt = 4, transactionType = "transfer")

    private fun expense(categoryId: String, amount: Double, type: String) =
        Expense(amount = amount, dateMillis = 0L, categoryId = categoryId, note = "", transactionType = type)

    @Test
    fun buildInsightsState_emptyExpenses_isAllZero() {
        val state = buildInsightsState("EUR", listOf(groceries), emptyList(), AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)

        assertEquals(0.0, state.totalExpenses, 0.0)
        assertEquals(0.0, state.totalIncome, 0.0)
        assertEquals(0.0, state.totalTransfers, 0.0)
        assertTrue(state.expensesByCategory.isEmpty())
        assertFalse(state.isLoading)
    }

    @Test
    fun buildInsightsState_groupsByTypeAndCategory() {
        val expenses = listOf(
            expense("c1", 10.0, "expense"),
            expense("c1", 5.0, "expense"),
            expense("c2", 3.0, "expense"),
            expense("c3", 100.0, "income"),
            expense("c4", 50.0, "transfer"),
        )
        val state = buildInsightsState(
            "EUR", listOf(groceries, dining, salary, transferCat), expenses,
            AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false,
        )

        assertEquals(18.0, state.totalExpenses, 0.0)
        assertEquals(100.0, state.totalIncome, 0.0)
        assertEquals(50.0, state.totalTransfers, 0.0)
        assertEquals(15.0, state.expensesByCategory[groceries])
        assertEquals(3.0, state.expensesByCategory[dining])
        assertEquals(100.0, state.incomeByCategory[salary])
        assertEquals(50.0, state.transfersByCategory[transferCat])
    }

    @Test
    fun buildInsightsState_expenseWithUnknownCategory_isExcludedFromGrouping() {
        val expenses = listOf(expense("does-not-exist", 10.0, "expense"))
        val state = buildInsightsState("EUR", listOf(groceries), expenses, AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)

        // Still counted in the total — only the per-category breakdown drops it.
        assertEquals(10.0, state.totalExpenses, 0.0)
        assertTrue(state.expensesByCategory.isEmpty())
    }

    @Test
    fun buildInsightsState_roundsAwayFloatingPointArtefacts() {
        // 0.1 + 0.2 != 0.3 in raw IEEE 754 double arithmetic.
        val expenses = listOf(expense("c1", 0.1, "expense"), expense("c1", 0.2, "expense"))
        val state = buildInsightsState("EUR", listOf(groceries), expenses, AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)

        assertEquals(0.3, state.totalExpenses, 0.0)
        assertEquals(0.3, state.expensesByCategory[groceries])
    }

    @Test
    fun buildInsightsState_truncatedOnlyMattersForAllTime() {
        val thisMonth = buildInsightsState("EUR", emptyList(), emptyList(), AnalyticsPeriod.THIS_MONTH.storageKey, truncated = true)
        val allTime = buildInsightsState("EUR", emptyList(), emptyList(), AnalyticsPeriod.ALL_TIME.storageKey, truncated = true)
        val allTimeNotTruncated = buildInsightsState("EUR", emptyList(), emptyList(), AnalyticsPeriod.ALL_TIME.storageKey, truncated = false)

        assertFalse("truncation on a bounded period must not surface", thisMonth.dataTruncated)
        assertTrue(allTime.dataTruncated)
        assertFalse(allTimeNotTruncated.dataTruncated)
    }

    @Test
    fun categoryMapsEquivalent_sameContentDifferentOrder_isTrue() {
        val a = linkedMapOf(groceries to 10.0, dining to 5.0)
        val b = linkedMapOf(dining to 5.0, groceries to 10.0)

        assertTrue(categoryMapsEquivalent(a, b))
    }

    @Test
    fun categoryMapsEquivalent_differentAmount_isFalse() {
        val a = mapOf(groceries to 10.0)
        val b = mapOf(groceries to 10.01)

        assertFalse(categoryMapsEquivalent(a, b))
    }

    @Test
    fun categoryMapsEquivalent_differentSize_isFalse() {
        val a = mapOf(groceries to 10.0, dining to 5.0)
        val b = mapOf(groceries to 10.0)

        assertFalse(categoryMapsEquivalent(a, b))
    }

    @Test
    fun insightsStatesEquivalent_identicalState_isTrue() {
        val state = buildInsightsState("EUR", listOf(groceries), listOf(expense("c1", 10.0, "expense")), AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)

        assertTrue(insightsStatesEquivalent(state, state.copy()))
    }

    @Test
    fun insightsStatesEquivalent_differentPeriod_isFalse() {
        val state = buildInsightsState("EUR", listOf(groceries), emptyList(), AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)
        val other = state.copy(periodKey = AnalyticsPeriod.ALL_TIME.storageKey)

        assertFalse(insightsStatesEquivalent(state, other))
    }

    @Test
    fun insightsStatesEquivalent_differentCashFlowTrend_isFalse() {
        val state = buildInsightsState("EUR", listOf(groceries), emptyList(), AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)
        val other = state.copy(cashFlowTrend = listOf(com.aus.ausgegeben.util.CashFlowPoint(0L, "Jan", 1.0, 0.0)))

        assertFalse(insightsStatesEquivalent(state, other))
    }
}
