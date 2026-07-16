package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class WealthTrendTest {

    @Test
    fun emptyExpenses_returnsEmptyTrend() {
        val trend = emptyList<Expense>().computeWealthTrend(AnalyticsPeriod.THIS_MONTH)
        assertTrue(trend.isEmpty())
    }

    @Test
    fun transfersAreExcludedFromWealthTrend() {
        val now = fixedTime(2026, Calendar.JUNE, 15, 12)
        val expenses = listOf(
            expense(amount = 50.0, type = "expense", day = 10, now = now),
            expense(amount = 100.0, type = "transfer", day = 10, now = now),
            expense(amount = 80.0, type = "income", day = 11, now = now),
        )
        val trend = expenses.computeWealthTrend(AnalyticsPeriod.THIS_MONTH, nowMillis = now)
        assertTrue(trend.isNotEmpty())
        val totalNet = trend.last().cumulativeNet
        assertEquals(30.0, totalNet, 0.001)
    }

    @Test
    fun cumulativeNet_accumulatesDailyBuckets() {
        val now = fixedTime(2026, Calendar.JUNE, 5, 12)
        val expenses = listOf(
            expense(amount = 20.0, type = "expense", day = 1, now = now),
            expense(amount = 50.0, type = "income", day = 2, now = now),
            expense(amount = 10.0, type = "expense", day = 3, now = now),
        )
        val trend = expenses.computeWealthTrend(AnalyticsPeriod.THIS_MONTH, nowMillis = now)
        assertTrue(trend.size >= 3)

        val day1 = trend.find { it.periodNet == -20.0 }
        val day2 = trend.find { it.periodNet == 50.0 }
        val day3 = trend.find { it.periodNet == -10.0 }

        assertEquals(-20.0, day1?.cumulativeNet ?: 0.0, 0.001)
        assertEquals(30.0, day2?.cumulativeNet ?: 0.0, 0.001)
        assertEquals(20.0, day3?.cumulativeNet ?: 0.0, 0.001)
        assertEquals(20.0, trend.last().cumulativeNet, 0.001)
    }

    @Test
    fun allTime_groupsByMonth() {
        val jan = fixedTime(2026, Calendar.JANUARY, 15, 12)
        val feb = fixedTime(2026, Calendar.FEBRUARY, 10, 12)
        val expenses = listOf(
            expense(amount = 100.0, type = "income", millis = jan),
            expense(amount = 40.0, type = "expense", millis = feb),
        )
        val trend = expenses.computeWealthTrend(
            AnalyticsPeriod.ALL_TIME,
            nowMillis = feb,
        )
        assertEquals(2, trend.size)
        assertEquals(100.0, trend[0].cumulativeNet, 0.001)
        assertEquals(60.0, trend[1].cumulativeNet, 0.001)
    }

    @Test
    fun computeCashFlowTrend_excludesTransfers() {
        val now = fixedTime(2026, Calendar.JUNE, 5, 12)
        val expenses = listOf(
            expense(amount = 20.0, type = "expense", day = 1, now = now),
            expense(amount = 100.0, type = "transfer", day = 1, now = now),
            expense(amount = 50.0, type = "income", day = 2, now = now),
        )
        val trend = expenses.computeCashFlowTrend("month:2026-06", nowMillis = now)
        assertTrue(trend.isNotEmpty())
        val totalIncome = trend.sumOf { it.income }
        val totalExpense = trend.sumOf { it.expense }
        assertEquals(50.0, totalIncome, 0.001)
        assertEquals(20.0, totalExpense, 0.001)
    }

    @Test
    fun zeroActivityDays_stillAppearInRange() {
        val now = fixedTime(2026, Calendar.JUNE, 3, 12)
        val expenses = listOf(
            expense(amount = 15.0, type = "expense", day = 1, now = now),
        )
        val trend = expenses.computeWealthTrend(AnalyticsPeriod.THIS_MONTH, nowMillis = now)
        assertTrue(trend.size >= 3)
        val quietDay = trend.find { it.periodNet == 0.0 && it.cumulativeNet == -15.0 }
        assertTrue(quietDay != null)
    }

    private fun expense(
        amount: Double,
        type: String,
        day: Int,
        now: Long,
    ): Expense {
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, 10)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return expense(amount = amount, type = type, millis = cal.timeInMillis)
    }

    private fun expense(amount: Double, type: String, millis: Long): Expense =
        Expense(
            amount = amount,
            dateMillis = millis,
            categoryId = "1",
            note = "",
            transactionType = type,
        )

    private fun fixedTime(year: Int, month: Int, day: Int, hour: Int): Long =
        Calendar.getInstance().apply {
            set(year, month, day, hour, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
}
