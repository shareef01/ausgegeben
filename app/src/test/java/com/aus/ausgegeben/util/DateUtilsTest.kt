package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

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

    @Test
    fun localDayStartMillis_plusDays_stepsCalendarDaysAcrossDst() = inBerlin {
        // 2026-03-29 is 23h long and 2026-10-25 is 25h long in Europe/Berlin.
        // `now - 24h` early on 03-30 lands on 03-28, and `dayStart + 24h` on
        // 10-25 ends at 23:00, so the last hour of the day fell outside it.
        val afterSpringForward = millis(2026, Calendar.MARCH, 30, 0, 30)
        assertEquals(millis(2026, Calendar.MARCH, 29, 0, 0), localDayStartMillis(afterSpringForward, plusDays = -1))

        val fallBackDay = millis(2026, Calendar.OCTOBER, 25, 19, 0)
        assertEquals(millis(2026, Calendar.OCTOBER, 26, 0, 0), localDayStartMillis(fallBackDay, plusDays = 1))
        assertEquals(25 * 3_600_000L, localDayStartMillis(fallBackDay, plusDays = 1) - localDayStartMillis(fallBackDay))

        assertEquals(localDayStartMillis(fallBackDay), localDayStartMillis(fallBackDay, plusDays = 0))
    }

    @Test
    fun withLocalTimeOfDay_keepsOriginalTimeOnNewDay() = inBerlin {
        val original = millis(2026, Calendar.MARCH, 20, 8, 15) + 42_000L
        // Moving across the spring-forward day still yields 08:15:42 local, not 09:15:42.
        val moved = withLocalTimeOfDay(millis(2026, Calendar.APRIL, 2, 0, 0), original)
        assertEquals(millis(2026, Calendar.APRIL, 2, 8, 15) + 42_000L, moved)
    }

    private fun millis(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
        Calendar.getInstance().apply {
            clear()
            set(year, month, day, hour, minute, 0)
        }.timeInMillis

    private fun inBerlin(block: () -> Unit) {
        val original = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Berlin"))
        try {
            block()
        } finally {
            TimeZone.setDefault(original)
        }
    }
}
