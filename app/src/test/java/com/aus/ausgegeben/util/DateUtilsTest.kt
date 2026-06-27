package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar

class DateUtilsTest {

    @Test
    fun localDayStartMillis_normalizesToMidnight() {
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.JUNE, 15, 14, 30, 45)
            set(Calendar.MILLISECOND, 123)
        }
        val start = localDayStartMillis(cal.timeInMillis)
        val normalized = Calendar.getInstance().apply { timeInMillis = start }
        assertEquals(0, normalized.get(Calendar.HOUR_OF_DAY))
        assertEquals(0, normalized.get(Calendar.MINUTE))
        assertEquals(15, normalized.get(Calendar.DAY_OF_MONTH))
    }
}
