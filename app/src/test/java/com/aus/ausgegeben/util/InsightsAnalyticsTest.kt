package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class InsightsAnalyticsTest {

    private val groceries = Category(id = "c1", name = "Groceries", iconName = "cart", colorInt = 1, transactionType = "expense")
    private val dining = Category(id = "c2", name = "Dining", iconName = "food", colorInt = 2, transactionType = "expense")
    private val rent = Category(id = "c3", name = "Rent", iconName = "home", colorInt = 3, transactionType = "expense")
    private val salary = Category(id = "c4", name = "Salary", iconName = "cash", colorInt = 4, transactionType = "income")

    @Test
    fun computePeriodComparison_noPriorData_returnsZeroAndNullDeltas() {
        val comparison = computePeriodComparison(
            currentExpenses = 250.0,
            currentIncome = 1000.0,
            priorExpenses = 0.0,
            priorIncome = 0.0,
            hasPriorData = false,
        )

        assertFalse(comparison.hasPriorData)
        assertEquals(0.0, comparison.priorExpenses, 0.0)
        assertEquals(0.0, comparison.priorIncome, 0.0)
        assertEquals(0.0, comparison.expenseDelta, 0.0)
        assertNull(comparison.expensePercentageDelta)
        assertEquals(0.0, comparison.incomeDelta, 0.0)
        assertNull(comparison.incomePercentageDelta)
        assertEquals(0.0, comparison.netDelta, 0.0)
    }

    @Test
    fun computePeriodComparison_withPriorData_computesExactDeltasAndPercentages() {
        val comparison = computePeriodComparison(
            currentExpenses = 300.0,
            currentIncome = 1500.0,
            priorExpenses = 200.0,
            priorIncome = 1000.0,
            hasPriorData = true,
        )

        assertTrue(comparison.hasPriorData)
        assertEquals(200.0, comparison.priorExpenses, 0.0)
        assertEquals(1000.0, comparison.priorIncome, 0.0)
        assertEquals(100.0, comparison.expenseDelta, 0.0)
        assertEquals(50.0, comparison.expensePercentageDelta!!, 0.01)
        assertEquals(500.0, comparison.incomeDelta, 0.0)
        assertEquals(50.0, comparison.incomePercentageDelta!!, 0.01)
        // Current Net: 1500 - 300 = 1200; Prior Net: 1000 - 200 = 800; Net delta: +400
        assertEquals(400.0, comparison.netDelta, 0.0)
    }

    @Test
    fun computePeriodComparison_decreasedExpenses_negativeDelta() {
        val comparison = computePeriodComparison(
            currentExpenses = 150.0,
            currentIncome = 1000.0,
            priorExpenses = 200.0,
            priorIncome = 1000.0,
            hasPriorData = true,
        )

        assertEquals(-50.0, comparison.expenseDelta, 0.0)
        assertEquals(-25.0, comparison.expensePercentageDelta!!, 0.01)
    }

    @Test
    fun computePeriodComparison_zeroPriorExpense_percentageDeltaIsNull() {
        val comparison = computePeriodComparison(
            currentExpenses = 150.0,
            currentIncome = 1000.0,
            priorExpenses = 0.0,
            priorIncome = 1000.0,
            hasPriorData = true,
        )

        assertEquals(150.0, comparison.expenseDelta, 0.0)
        assertNull("Division by zero in percentage change must be null", comparison.expensePercentageDelta)
    }

    @Test
    fun computeSpendingPace_nullRange_returnsNull() {
        assertNull(computeSpendingPace(100.0, null))
    }

    @Test
    fun computeSpendingPace_pastRange_completedMonth() {
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.JANUARY, 1, 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        cal.set(2026, Calendar.FEBRUARY, 1, 0, 0, 0)
        val end = cal.timeInMillis

        // Evaluate after end of month
        val now = end + 10000L

        val pace = computeSpendingPace(
            currentExpenses = 310.0,
            rangeMillis = start to end,
            nowMillis = now,
            monthlyBudget = 300.0,
        )

        assertNotNull(pace)
        assertEquals(31, pace!!.daysInMonth)
        assertEquals(31, pace.daysElapsed)
        assertEquals(10.0, pace.dailyAverage, 0.01)
        assertEquals(310.0, pace.projectedTotal, 0.01)
        assertEquals(300.0, pace.budget!!, 0.01)
        assertEquals(10.0, pace.projectedOverBudget!!, 0.01)
    }

    @Test
    fun computeSpendingPace_midMonth_projectsAccurately() {
        // 30-day month: April 2026
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.APRIL, 1, 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val start = cal.timeInMillis
        cal.set(2026, Calendar.MAY, 1, 0, 0, 0)
        val end = cal.timeInMillis

        // April 15 noon
        cal.set(2026, Calendar.APRIL, 15, 12, 0, 0)
        val now = cal.timeInMillis

        val pace = computeSpendingPace(
            currentExpenses = 150.0,
            rangeMillis = start to end,
            nowMillis = now,
            monthlyBudget = 400.0,
        )

        assertNotNull(pace)
        assertEquals(30, pace!!.daysInMonth)
        assertEquals(15, pace.daysElapsed)
        assertEquals(10.0, pace.dailyAverage, 0.01)
        assertEquals(300.0, pace.projectedTotal, 0.01)
        assertEquals(400.0, pace.budget!!, 0.01)
        assertNull("Not over budget", pace.projectedOverBudget)
    }

    @Test
    fun computeCategoryMovers_calculatesDeltasAndTakesTopMovers() {
        val current = mapOf(
            "c1" to 200.0, // Groceries: 200 vs 100 -> +100
            "c2" to 30.0,  // Dining: 30 vs 150 -> -120
            "c3" to 500.0, // Rent: 500 vs 500 -> 0 (ignored)
            "c4" to 80.0,  // New cat: 80 vs 0 -> +80
        )
        val prior = mapOf(
            "c1" to 100.0,
            "c2" to 150.0,
            "c3" to 500.0,
        )
        val categories = listOf(groceries, dining, rent)

        val movers = computeCategoryMovers(
            currentExpensesMap = current,
            priorExpensesMap = prior,
            categories = categories,
            maxMovers = 2,
        )

        // Top 2 by absolute delta: Dining (-120), Groceries (+100)
        assertEquals(2, movers.size)
        assertEquals("Dining", movers[0].categoryName)
        assertEquals(-120.0, movers[0].delta, 0.01)
        assertEquals(-80.0, movers[0].percentageDelta!!, 0.1)

        assertEquals("Groceries", movers[1].categoryName)
        assertEquals(100.0, movers[1].delta, 0.01)
        assertEquals(100.0, movers[1].percentageDelta!!, 0.1)
    }

    @Test
    fun computeAllTimeAverages_emptyList_returnsNull() {
        assertNull(computeAllTimeAverages(emptyList()))
    }

    @Test
    fun computeAllTimeAverages_averagesAcrossDistinctMonths() {
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.JANUARY, 10, 12, 0, 0)
        }
        val janMillis = cal.timeInMillis
        cal.set(2026, Calendar.FEBRUARY, 15, 12, 0, 0)
        val febMillis = cal.timeInMillis

        val expenses = listOf(
            Expense(amount = 200.0, dateMillis = janMillis, categoryId = "c1", note = "", transactionType = "expense"),
            Expense(amount = 1000.0, dateMillis = janMillis, categoryId = "c4", note = "", transactionType = "income"),
            Expense(amount = 400.0, dateMillis = febMillis, categoryId = "c1", note = "", transactionType = "expense"),
            Expense(amount = 1200.0, dateMillis = febMillis, categoryId = "c4", note = "", transactionType = "income"),
            Expense(amount = 50.0, dateMillis = febMillis, categoryId = "trans", note = "", transactionType = "transfer"),
        )

        val averages = computeAllTimeAverages(expenses)
        assertNotNull(averages)
        assertEquals(2, averages!!.monthsCount)
        // Expenses: (200 + 400) / 2 = 300
        assertEquals(300.0, averages.averageMonthlyExpenses, 0.01)
        // Income: (1000 + 1200) / 2 = 1100
        assertEquals(1100.0, averages.averageMonthlyIncome, 0.01)
        // Net: 1100 - 300 = 800
        assertEquals(800.0, averages.averageMonthlyNet, 0.01)
    }
}
