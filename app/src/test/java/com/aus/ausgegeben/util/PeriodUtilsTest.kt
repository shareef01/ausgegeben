package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar

class PeriodUtilsTest {

    @Test
    fun thisMonthRange_containsExpenseOnFirstDay() {
        val cal = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 12)
        }
        val expense = Expense(
            amount = 10.0,
            dateMillis = cal.timeInMillis,
            categoryId = 1L,
            note = "",
            transactionType = "expense"
        )
        val filtered = listOf(expense).filterByPeriod(
            AnalyticsPeriod.THIS_MONTH,
            nowMillis = cal.timeInMillis
        )
        assertEquals(1, filtered.size)
    }

    @Test
    fun allTime_doesNotFilter() {
        val expenses = listOf(
            Expense(1, 5.0, 0L, 1L, "", transactionType = "expense"),
            Expense(2, 7.0, System.currentTimeMillis(), 1L, "", transactionType = "expense")
        )
        assertEquals(expenses, expenses.filterByPeriod(AnalyticsPeriod.ALL_TIME))
    }

    @Test
    fun lastMonth_excludesCurrentMonthExpense() {
        val now = Calendar.getInstance()
        val current = Expense(
            amount = 1.0,
            dateMillis = now.timeInMillis,
            categoryId = 1L,
            note = "",
            transactionType = "expense"
        )
        val filtered = listOf(current).filterByPeriod(AnalyticsPeriod.LAST_MONTH, now.timeInMillis)
        assertEquals(0, filtered.size)
    }

    @Test
    fun computeInsights_countsMonthExpensesOnly() {
        val now = System.currentTimeMillis()
        val expense = Expense(
            amount = 25.0,
            dateMillis = now,
            categoryId = 1L,
            note = "",
            transactionType = "expense"
        )
        val insights = computeSpendingInsights(
            expenses = listOf(expense),
            categoryNames = mapOf(1L to "Food")
        )
        assertEquals(25.0, insights.monthExpenseTotal, 0.001)
        assertEquals("Food", insights.topExpenseCategoryName)
    }
}
