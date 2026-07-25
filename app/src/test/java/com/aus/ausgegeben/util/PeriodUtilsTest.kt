package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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
}
