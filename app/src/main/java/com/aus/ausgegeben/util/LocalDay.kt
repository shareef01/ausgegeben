package com.aus.ausgegeben.util

import java.util.Calendar
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlin.math.min

/** Local midnight at the start of the day containing [nowMillis]. */
fun startOfLocalDayMillis(nowMillis: Long = System.currentTimeMillis()): Long =
    Calendar.getInstance().apply {
        timeInMillis = nowMillis
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

/** How often the day is re-checked at most; see [localDayFlow]. */
const val LOCAL_DAY_RECHECK_MS = 15 * 60_000L

/**
 * Start of the current local day, emitted again whenever the date changes while collected.
 * Mirrors web `useLocalDay`.
 *
 * Anything derived from "today" (a period's query range, the "same days last month"
 * cut-off) was computed once when the period was chosen, so a screen kept open past
 * midnight stayed on the old day. The flow sleeps until just after midnight, but never
 * longer than [recheckMs] in one go: coroutine delays run on uptime, which stops while
 * the device sleeps, so a single long delay could fire hours late.
 */
fun localDayFlow(
    clock: () -> Long = System::currentTimeMillis,
    recheckMs: Long = LOCAL_DAY_RECHECK_MS,
): Flow<Long> = flow {
    while (true) {
        val now = clock()
        emit(startOfLocalDayMillis(now))
        delay(min(startOfTomorrowMillis(now) - now + 1_000L, recheckMs))
    }
}.distinctUntilChanged()

/**
 * U-5: whether a row dated [dateMillis] falls after the day starting at [todayStartMillis].
 * The record list marks such days upcoming, so rent logged before it is due does not sit at
 * the top of a date-sorted list looking like the latest spending. Mirrors web `groupRecordRows`.
 */
fun isUpcomingDay(dateMillis: Long, todayStartMillis: Long): Boolean =
    dateMillis >= startOfTomorrowMillis(todayStartMillis)
