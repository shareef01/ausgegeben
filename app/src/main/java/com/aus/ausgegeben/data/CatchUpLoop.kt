package com.aus.ausgegeben.data

import kotlinx.coroutines.delay

/**
 * AUS-202: one catch-up pass materializes at most Recurrence.MAX_PER_PASS (20) due
 * dates, and nothing ran the next pass until another trigger (resume, reconnect). A
 * backlog of 45 due dates left 25 waiting, so balances and budgets stayed behind.
 *
 * Now a pass that used its whole budget and made progress is followed by another after
 * a short pause, until the backlog is done. The run is bounded ([MAX_CATCH_UP_CONTINUATIONS]
 * extra passes per trigger), stops when [shouldContinue] says no (another account signed
 * in), and is cancelled with the coroutine that runs it. Mirrors web catchUpLoop.ts.
 */
internal const val MAX_CATCH_UP_CONTINUATIONS = 25
internal const val CATCH_UP_CONTINUATION_DELAY_MS = 1_000L

/** Runs [pass] (which returns whether due work is left) until done. Returns the passes run. */
internal suspend fun runCatchUp(
    pass: suspend () -> Boolean,
    shouldContinue: () -> Boolean,
    wait: suspend (Long) -> Unit = { delay(it) },
    maxContinuations: Int = MAX_CATCH_UP_CONTINUATIONS,
): Int {
    var passes = 1
    var more = pass()
    var continuation = 0
    while (more && continuation < maxContinuations) {
        continuation++
        wait(CATCH_UP_CONTINUATION_DELAY_MS)
        if (!shouldContinue()) break
        more = pass()
        passes++
    }
    return passes
}
