package com.aus.ausgegeben.util

import java.util.Calendar
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** F-6: "today" must move on while a screen stays open past midnight. Mirrors web useLocalDay.test.ts. */
@OptIn(ExperimentalCoroutinesApi::class)
class LocalDayTest {

    private fun at(year: Int, month: Int, day: Int, hour: Int = 0, minute: Int = 0): Long =
        Calendar.getInstance().apply {
            clear()
            set(year, month - 1, day, hour, minute)
        }.timeInMillis

    @Test
    fun startOfLocalDay_isLocalMidnight() {
        assertEquals(at(2026, 11, 14), startOfLocalDayMillis(at(2026, 11, 14, 23, 59)))
        assertEquals(at(2026, 11, 15), startOfLocalDayMillis(at(2026, 11, 15, 0, 0)))
    }

    @Test
    fun localDayFlow_emitsOncePerDay_justAfterMidnight() = runTest {
        val base = at(2026, 11, 14, 23, 58)
        val clock = { base + testScheduler.currentTime }
        val seen = mutableListOf<Long>()
        val job = launch { localDayFlow(clock).collect { seen += it } }

        runCurrent()
        assertEquals(listOf(at(2026, 11, 14)), seen)

        advanceTimeBy(60_000) // 23:59
        runCurrent()
        assertEquals(1, seen.size)

        advanceTimeBy(2 * 60_000) // past midnight
        runCurrent()
        assertEquals(listOf(at(2026, 11, 14), at(2026, 11, 15)), seen)

        // A whole day of 15-minute re-checks reports exactly one more change.
        advanceTimeBy(24 * 60 * 60_000L)
        runCurrent()
        assertEquals(listOf(at(2026, 11, 14), at(2026, 11, 15), at(2026, 11, 16)), seen)
        job.cancel()
    }

    @Test
    fun localDayFlow_catchesUpAfterAClockJump_withinOneRecheck() = runTest {
        // Device sleep: wall-clock time jumps while coroutine delays (uptime) do not advance.
        var wallClock = at(2026, 11, 30, 22, 0)
        val seen = mutableListOf<Long>()
        val job = launch { localDayFlow({ wallClock }).collect { seen += it } }
        runCurrent()

        wallClock = at(2026, 12, 1, 8, 0)
        advanceTimeBy(LOCAL_DAY_RECHECK_MS)
        runCurrent()
        assertEquals(listOf(at(2026, 11, 30), at(2026, 12, 1)), seen)
        job.cancel()
    }

    @Test
    fun ranges_derivedFromTheDay_moveForwardButPastMonthsStayPut() {
        val nov14 = at(2026, 11, 14)
        val nov15 = at(2026, 11, 15)
        assertEquals(at(2026, 10, 15), previousPeriodRange("month:2026-11", nov14)!!.second.second)
        assertEquals(at(2026, 10, 16), previousPeriodRange("month:2026-11", nov15)!!.second.second)
        assertEquals(previousPeriodRange("month:2026-09", nov14), previousPeriodRange("month:2026-09", nov15))
        assertEquals(analyticsDateRangeMillis("month:2026-09", nov14), analyticsDateRangeMillis("month:2026-09", nov15))
    }
}
