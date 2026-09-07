package com.aus.ausgegeben.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertSame
import org.junit.Test

class SuspendResultTest {
    @Test(expected = CancellationException::class)
    fun cancellation_isRethrown() = runTest {
        runSuspendCatching<Unit> { throw CancellationException("cancel") }
    }

    @Test
    fun ordinaryException_isResultFailure() = runTest {
        val error = IllegalStateException("failed")
        val result = runSuspendCatching<Unit> { throw error }
        assertSame(error, result.exceptionOrNull())
    }
}
