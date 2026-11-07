package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class PeriodUtilsTest {

    @Test
    fun monthStorageKey_formatsCorrectly() {
        assertEquals("month:2024-01", monthStorageKey(2024, 0))
        assertEquals("month:2024-12", monthStorageKey(2024, 11))
    }

    @Test
    fun analyticsMonthRangeFromStorageKey_parsesValidKeys() {
        val range = analyticsMonthRangeFromStorageKey("month:2024-05")
        assertNotNull(range)
        
        val cal = Calendar.getInstance().apply { 
            timeInMillis = range!!.first
            timeZone = TimeZone.getDefault()
        }
        assertEquals(2024, cal.get(Calendar.YEAR))
        assertEquals(Calendar.MAY, cal.get(Calendar.MONTH))
        assertEquals(1, cal.get(Calendar.DAY_OF_MONTH))
        
        val endCal = Calendar.getInstance().apply { 
            timeInMillis = range!!.second
            timeZone = TimeZone.getDefault()
        }
        assertEquals(2024, endCal.get(Calendar.YEAR))
        assertEquals(Calendar.JUNE, endCal.get(Calendar.MONTH))
        assertEquals(1, endCal.get(Calendar.DAY_OF_MONTH))
    }

    @Test
    fun analyticsMonthRangeFromStorageKey_returnsNullForInvalidKeys() {
        assertNull(analyticsMonthRangeFromStorageKey("invalid"))
        assertNull(analyticsMonthRangeFromStorageKey("month:2024"))
        assertNull(analyticsMonthRangeFromStorageKey("month:2024-13"))
    }

    @Test
    fun analyticsPeriodOptions_defaultDepthIsFourteenMonthsPlusAllTime() {
        val now = Calendar.getInstance().apply {
            set(2026, Calendar.JUNE, 15, 12, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val options = analyticsPeriodOptions(nowMillis = now)
        assertEquals(15, options.size)
        assertEquals("all_time", options.first().storageKey)
        assertEquals("month:2026-06", options[1].storageKey)
        assertEquals("month:2025-05", options.last().storageKey)
    }

    @Test
    fun analyticsPeriod_dateRangeMillis_matchesExpected() {
        val now = Calendar.getInstance().apply {
            set(2024, Calendar.JULY, 15)
        }.timeInMillis
        
        val thisMonth = AnalyticsPeriod.THIS_MONTH.dateRangeMillis(now)
        assertNotNull(thisMonth)
        val start = Calendar.getInstance().apply { timeInMillis = thisMonth!!.first }
        assertEquals(2024, start.get(Calendar.YEAR))
        assertEquals(Calendar.JULY, start.get(Calendar.MONTH))
        
        val lastMonth = AnalyticsPeriod.LAST_MONTH.dateRangeMillis(now)
        assertNotNull(lastMonth)
        val lastStart = Calendar.getInstance().apply { timeInMillis = lastMonth!!.first }
        assertEquals(2024, lastStart.get(Calendar.YEAR))
        assertEquals(Calendar.JUNE, lastStart.get(Calendar.MONTH))
        
        assertNull(AnalyticsPeriod.ALL_TIME.dateRangeMillis(now))
    }

    @Test
    fun previousPeriodRange_returnsPrecedingMonthRange() {
        val prev = previousPeriodRange("month:2026-06")
        assertNotNull(prev)
        assertEquals("month:2026-05", prev!!.first)
        val cal = Calendar.getInstance().apply { timeInMillis = prev.second.first }
        assertEquals(2026, cal.get(Calendar.YEAR))
        assertEquals(Calendar.MAY, cal.get(Calendar.MONTH))

        // Year boundary
        val prevJan = previousPeriodRange("month:2026-01")
        assertNotNull(prevJan)
        assertEquals("month:2025-12", prevJan!!.first)
        val calJan = Calendar.getInstance().apply { timeInMillis = prevJan.second.first }
        assertEquals(2025, calJan.get(Calendar.YEAR))
        assertEquals(Calendar.DECEMBER, calJan.get(Calendar.MONTH))

        // All time and invalid
        assertNull(previousPeriodRange("all_time"))
        assertNull(previousPeriodRange("invalid"))
    }

    private fun millis(year: Int, month: Int, day: Int, hour: Int = 0): Long =
        Calendar.getInstance().apply {
            set(year, month, day, hour, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    @Test
    fun previousPeriodRange_cutsPriorMonthToSameDaysWhileMonthInProgress() {
        // 15 June: compare 1–15 June with 1–15 May, not with all of May.
        val now = millis(2026, Calendar.JUNE, 15, 12)
        val prior = previousPeriodRange("this_month", now)!!
        assertEquals(millis(2026, Calendar.MAY, 1), prior.second.first)
        assertEquals(millis(2026, Calendar.MAY, 16), prior.second.second)
        assertEquals(prior, previousPeriodRange("month:2026-06", now))
        assertTrue(isComparisonToDate("this_month", now))
    }

    @Test
    fun previousPeriodRange_keepsWholePriorMonthForFinishedMonth() {
        val now = millis(2026, Calendar.JUNE, 15, 12)
        val prior = previousPeriodRange("month:2026-05", now)!!
        assertEquals(millis(2026, Calendar.APRIL, 1) to millis(2026, Calendar.MAY, 1), prior.second)
        assertFalse(isComparisonToDate("month:2026-05", now))
        assertFalse(isComparisonToDate("last_month", now))
        assertFalse(isComparisonToDate("all_time", now))
    }

    @Test
    fun previousPeriodRange_capsToDateRangeAtEndOfShorterPriorMonth() {
        // 31 March vs February: the whole of February, not spilling into March.
        val now = millis(2026, Calendar.MARCH, 31, 18)
        val prior = previousPeriodRange("this_month", now)!!
        assertEquals(millis(2026, Calendar.FEBRUARY, 1) to millis(2026, Calendar.MARCH, 1), prior.second)
    }
}
