package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Expense
import java.util.Calendar
import org.junit.Assert.assertEquals
import org.junit.Test

/** Record totals leave out rows dated after today while the period includes today. Mirrors web analytics.test.ts. */
class RowsCountedToDateTest {

    private fun at(year: Int, month: Int, day: Int, hour: Int = 0, minute: Int = 0): Long =
        Calendar.getInstance().apply {
            clear()
            set(year, month - 1, day, hour, minute)
        }.timeInMillis

    private fun row(id: String, dateMillis: Long) =
        Expense(id = id, amount = 10.0, dateMillis = dateMillis, categoryId = "c", note = "")

    private val today = at(2026, 11, 14)
    private val nov = at(2026, 11, 1) to at(2026, 12, 1)
    private val rows = listOf(
        row("past", at(2026, 11, 3, 9)),
        row("late-today", at(2026, 11, 14, 23, 59)),
        row("tomorrow", at(2026, 11, 15)),
        row("rent", at(2026, 11, 28, 9)),
    )
    private fun ids(xs: List<Expense>) = xs.map { it.id }

    @Test
    fun dropsRowsFromTomorrowOn_whileThePeriodIncludesToday() {
        assertEquals(listOf("past", "late-today"), ids(rowsCountedToDate(rows, nov, today)))
    }

    @Test
    fun allTime_includesToday() {
        assertEquals(listOf("past", "late-today"), ids(rowsCountedToDate(rows, null, today)))
    }

    @Test
    fun aPeriodEntirelyInThePastOrFuture_countsEverything() {
        assertEquals(ids(rows), ids(rowsCountedToDate(rows, at(2026, 10, 1) to nov.first, today)))
        assertEquals(ids(rows), ids(rowsCountedToDate(rows, nov.second to at(2027, 1, 1), today)))
    }

    @Test
    fun aRowCountsOnceItsDayArrives() {
        assertEquals(ids(rows), ids(rowsCountedToDate(rows, nov, at(2026, 11, 28))))
    }
}
