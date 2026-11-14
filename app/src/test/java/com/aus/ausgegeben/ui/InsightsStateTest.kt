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

    /**
     * The breakdown must always account for the headline total. This test previously
     * asserted the opposite — that an expense whose category is gone is dropped from the
     * grouping — which is how the defect stayed invisible: the money left the donut while
     * "Spent" above it still counted the row, and a passing test said that was correct.
     * Orphans are reachable (deleteCategory can leave rows the rules refuse to reassign),
     * and the web client has always kept them as a "?" row.
     */
    @Test
    fun buildInsightsState_expenseWithUnknownCategory_keepsItInTheBreakdown() {
        val expenses = listOf(expense("does-not-exist", 10.0, "expense"))
        val state = buildInsightsState("EUR", listOf(groceries), expenses, AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false)

        assertEquals(10.0, state.totalExpenses, 0.0)
        assertEquals(1, state.expensesByCategory.size)
        val (placeholder, amount) = state.expensesByCategory.entries.single()
        assertEquals("does-not-exist", placeholder.id)
        assertEquals("?", placeholder.name)
        assertEquals(10.0, amount, 0.0)
        // The invariant that matters: the breakdown sums to the headline figure.
        assertEquals(state.totalExpenses, state.expensesByCategory.values.sum(), 0.0)
    }

    @Test
    fun buildInsightsState_mixedKnownAndOrphanCategories_breakdownStillSumsToTotal() {
        val expenses = listOf(
            expense("c1", 15.0, "expense"),
            expense("gone-1", 5.0, "expense"),
            expense("gone-2", 2.5, "expense"),
            expense("c3", 100.0, "income"),
            expense("gone-3", 20.0, "income"),
        )
        val state = buildInsightsState(
            "EUR", listOf(groceries, salary), expenses,
            AnalyticsPeriod.THIS_MONTH.storageKey, truncated = false,
        )

        assertEquals(22.5, state.totalExpenses, 0.0)
        assertEquals(state.totalExpenses, state.expensesByCategory.values.sum(), 0.0)
        assertEquals(state.totalIncome, state.incomeByCategory.values.sum(), 0.0)
        // Distinct dangling ids stay distinct rows rather than collapsing into one.
        assertEquals(3, state.expensesByCategory.size)
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

    @Test
    fun buildInsightsState_transferOnlyPriorPeriod_hasNoPriorData() {
        val state = buildInsightsState(
            currency = "EUR",
            categories = listOf(groceries, transferCat),
            scoped = listOf(expense("c1", 100.0, "expense")),
            periodKey = "month:2026-05",
            truncated = false,
            priorExpenses = listOf(expense("c4", 50.0, "transfer")),
            monthlyBudget = null,
        )

        assertFalse(state.comparison!!.hasPriorData)
    }

    @Test
    fun buildInsightsState_computesComparisonAndPaceWhenMonthly() {
        val current = listOf(expense("c1", 100.0, "expense"))
        val prior = listOf(expense("c1", 50.0, "expense"))
        val state = buildInsightsState(
            currency = "EUR",
            categories = listOf(groceries),
            scoped = current,
            periodKey = "month:2026-05",
            truncated = false,
            priorExpenses = prior,
            monthlyBudget = 200.0,
        )

        val comparison = state.comparison
        org.junit.Assert.assertNotNull(comparison)
        assertTrue(comparison!!.hasPriorData)
        assertEquals(50.0, comparison.expenseDelta, 0.01)
        assertEquals(100.0, comparison.expensePercentageDelta ?: 0.0, 0.01)

        val pace = state.pace
        org.junit.Assert.assertNotNull(pace)
        assertEquals(200.0, pace!!.budget ?: 0.0, 0.01)

        assertEquals(1, state.categoryMovers.size)
        assertEquals("Groceries", state.categoryMovers[0].categoryName)
        assertEquals(50.0, state.categoryMovers[0].delta, 0.01)
    }

    @Test
    fun buildInsightsState_allTime_computesAllTimeAveragesAndNullPace() {
        val expenses = listOf(
            expense("c1", 100.0, "expense"),
            expense("c3", 500.0, "income"),
        )
        val state = buildInsightsState(
            currency = "EUR",
            categories = listOf(groceries, salary),
            scoped = expenses,
            periodKey = AnalyticsPeriod.ALL_TIME.storageKey,
            truncated = false,
        )

        org.junit.Assert.assertNull(state.pace)
        org.junit.Assert.assertNull(state.comparison)
        val averages = state.allTimeAverages
        org.junit.Assert.assertNotNull(averages)
        assertEquals(100.0, averages!!.averageMonthlyExpenses, 0.01)
        assertEquals(500.0, averages.averageMonthlyIncome, 0.01)
    }

    // --- Future-dated rows in a month still in progress (F-1) and movers without prior data (F-2) ---

    private fun at(year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0): Long =
        java.util.Calendar.getInstance().apply {
            clear()
            set(year, month - 1, day, hour, minute)
        }.timeInMillis

    private fun dated(categoryId: String, amount: Double, millis: Long, type: String = "expense") =
        Expense(amount = amount, dateMillis = millis, categoryId = categoryId, note = "", transactionType = type)

    // 14 Nov 2026, mid-afternoon; November is in progress, October is cut to 1-14.
    private val now = at(2026, 11, 14, 15, 30)
    private val priorCut = listOf(dated("c1", 100.0, at(2026, 10, 3)), dated("c1", 40.0, at(2026, 10, 10)))

    @Test
    fun buildInsightsState_billDatedLaterThisMonth_isNotTreatedAsSpent() {
        val current = listOf(
            dated("c1", 70.0, at(2026, 11, 2)),
            dated("c1", 70.0, at(2026, 11, 12)),
            dated("c2", 1069.50, at(2026, 11, 28)), // logged early, due on the 28th
        )
        val state = buildInsightsState(
            "EUR", listOf(groceries, dining), current, "month:2026-11", truncated = false,
            priorExpenses = priorCut, monthlyBudget = 2000.0, nowMillis = now,
        )

        // Before the fix: 1,209.50 / 14 x 30 = 2,591.79, "over budget".
        val pace = state.pace!!
        assertEquals(10.0, pace.dailyAverage, 0.0)
        assertEquals(1369.50, pace.projectedTotal, 0.0)
        org.junit.Assert.assertNull(pace.projectedOverBudget)
        // 1-14 Nov (140) vs 1-14 Oct (140), not +1,069.50.
        assertEquals(0.0, state.comparison!!.expenseDelta, 0.0)
        // The headline total still counts everything recorded for the month.
        assertEquals(1209.50, state.totalExpenses, 0.0)
        assertFalse(state.categoryMovers.any { it.categoryId == "c2" })
    }

    @Test
    fun buildInsightsState_rowDatedLateToday_countsAsSpent() {
        val current = listOf(dated("c1", 140.0, at(2026, 11, 14, 23, 59)))
        val state = buildInsightsState(
            "EUR", listOf(groceries), current, "month:2026-11", truncated = false,
            priorExpenses = priorCut, nowMillis = now,
        )
        assertEquals(10.0, state.pace!!.dailyAverage, 0.0)
        assertEquals(0.0, state.comparison!!.expenseDelta, 0.0)
    }

    @Test
    fun buildInsightsState_finishedMonth_usesEveryRow() {
        val later = at(2026, 12, 5)
        val current = listOf(dated("c1", 100.0, at(2026, 11, 2)), dated("c2", 900.0, at(2026, 11, 28)))
        val state = buildInsightsState(
            "EUR", listOf(groceries, dining), current, "month:2026-11", truncated = false,
            priorExpenses = listOf(dated("c1", 1000.0, at(2026, 10, 2))), nowMillis = later,
        )
        assertEquals(0.0, state.comparison!!.expenseDelta, 0.0)
        assertEquals(1000.0, state.pace!!.projectedTotal, 0.0)
        assertTrue(state.categoryMovers.any { it.categoryId == "c2" })
    }

    @Test
    fun buildInsightsState_noPriorData_hasNoCategoryMovers() {
        val state = buildInsightsState(
            "EUR", listOf(dining), listOf(dated("c2", 154.50, at(2026, 11, 12))), "month:2026-11",
            truncated = false, priorExpenses = emptyList(), nowMillis = now,
        )
        assertFalse(state.comparison!!.hasPriorData)
        assertTrue(state.categoryMovers.isEmpty())
    }

    @Test
    fun buildInsightsState_transferOnlyPrior_hasNoCategoryMovers() {
        val state = buildInsightsState(
            "EUR", listOf(dining, transferCat), listOf(dated("c2", 154.50, at(2026, 11, 12))), "month:2026-11",
            truncated = false, priorExpenses = listOf(dated("c4", 50.0, at(2026, 10, 2), "transfer")), nowMillis = now,
        )
        assertTrue(state.categoryMovers.isEmpty())
    }
}
