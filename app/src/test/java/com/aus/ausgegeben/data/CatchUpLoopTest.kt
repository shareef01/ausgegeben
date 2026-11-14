package com.aus.ausgegeben.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** AUS-202: catch-up keeps passing until the backlog is done, within bounds. */
class CatchUpLoopTest {

    private val noWait: suspend (Long) -> Unit = {}

    @Test
    fun onePass_whenTheBacklogFits() = runTest {
        var calls = 0
        assertEquals(1, runCatchUp({ calls++; false }, { true }, noWait))
        assertEquals(1, calls)
    }

    @Test
    fun continuesUntilDone_45DueDatesAt20PerPass() = runTest {
        var remaining = 45
        val passes = runCatchUp({ remaining -= minOf(20, remaining); remaining > 0 }, { true }, noWait)
        assertEquals(0, remaining)
        assertEquals(3, passes)
    }

    @Test
    fun pausesBetweenPasses() = runTest {
        val waits = mutableListOf<Long>()
        var left = 2
        runCatchUp({ --left > 0 }, { true }, { waits += it })
        assertEquals(listOf(CATCH_UP_CONTINUATION_DELAY_MS), waits)
    }

    @Test
    fun stopsWhenTheAccountChanges() = runTest {
        var signedIn = true
        var calls = 0
        val passes = runCatchUp({ calls++; signedIn = false; true }, { signedIn }, noWait)
        assertEquals(1, passes)
        assertEquals(1, calls)
    }

    @Test
    fun boundedEvenIfEveryPassReportsMore() = runTest {
        assertEquals(1 + MAX_CATCH_UP_CONTINUATIONS, runCatchUp({ true }, { true }, noWait))
    }

    @Test
    fun aFailingPassPropagates() {
        var calls = 0
        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                runCatchUp({ calls++; check(calls < 2) { "offline" }; true }, { true }, noWait)
            }
        }
        assertEquals(2, calls)
    }
}
