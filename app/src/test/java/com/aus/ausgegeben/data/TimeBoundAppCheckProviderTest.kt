package com.aus.ausgegeben.data

import android.app.Application
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.firebase.appcheck.AppCheckProvider
import com.google.firebase.appcheck.AppCheckToken
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.TimeoutException

/**
 * A Pixel with a stuck key-provisioning service took ~10.7 s per Play Integrity attestation,
 * and Firebase held every save until it finished. These pin the time limit, the late-token
 * reuse and the fail-fast window.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class TimeBoundAppCheckProviderTest {

    private var now = 1_000_000L
    private val timers = mutableListOf<Pair<Long, () -> Unit>>()

    private fun fire(atOrBefore: Long) {
        val due = timers.filter { it.first <= atOrBefore }
        timers.removeAll(due)
        due.forEach { it.second() }
    }

    private class FakeDelegate : AppCheckProvider {
        val pending = mutableListOf<TaskCompletionSource<AppCheckToken>>()
        override fun getToken(): Task<AppCheckToken> = TaskCompletionSource<AppCheckToken>().also { pending += it }.task
    }

    private class Token(private val expire: Long) : AppCheckToken() {
        override fun getToken() = "t"
        override fun getExpireTimeMillis() = expire
    }

    private fun provider(delegate: AppCheckProvider) = TimeBoundAppCheckProvider(
        delegate, timeoutMs = 3_000, backoffMs = 300_000, clock = { now },
        schedule = { delay, action -> timers += (now + delay) to action },
    )

    @Test
    fun fastAttestation_passesStraightThrough() {
        val d = FakeDelegate(); val p = provider(d)
        val task = p.getToken()
        val token = Token(now + 3_600_000)
        d.pending.single().setResult(token)
        assertTrue(task.isSuccessful)
        assertSame(token, task.result)
    }

    @Test
    fun slowAttestation_failsAtTheTimeLimit_thenTheLateTokenIsReusedAtOnce() {
        val d = FakeDelegate(); val p = provider(d)
        val first = p.getToken()
        now += 3_000; fire(now)
        assertTrue("timed out", first.isComplete && first.exception is TimeoutException)

        // Within the fail-fast window nothing waits and no second attestation starts.
        val during = p.getToken()
        assertTrue(during.isComplete && !during.isSuccessful)
        assertEquals(1, d.pending.size)

        // The slow attestation finishes (10.7 s on the Pixel): the next call gets it instantly.
        now += 7_700
        val late = Token(now + 3_600_000)
        d.pending.single().setResult(late)
        val after = p.getToken()
        assertTrue(after.isSuccessful)
        assertSame(late, after.result)
        assertEquals(1, d.pending.size)
    }

    @Test
    fun failedAttestation_failsFastUntilTheBackoffEnds_thenRetries() {
        val d = FakeDelegate(); val p = provider(d)
        val first = p.getToken()
        d.pending.single().setException(IllegalStateException("App attestation failed"))
        assertFalse(first.isSuccessful)

        now += 60_000
        assertFalse(p.getToken().isSuccessful)
        assertEquals("no retry inside the backoff", 1, d.pending.size)

        now += 300_000
        p.getToken()
        assertEquals("retried after the backoff", 2, d.pending.size)
    }

    @Test
    fun aLateTokenNearExpiry_isNotReused() {
        val d = FakeDelegate(); val p = provider(d)
        p.getToken(); now += 3_000; fire(now)
        d.pending.single().setResult(Token(now + 60_000))
        now += 300_001
        p.getToken()
        assertEquals("near-expiry token dropped; a fresh attestation starts", 2, d.pending.size)
    }
}
