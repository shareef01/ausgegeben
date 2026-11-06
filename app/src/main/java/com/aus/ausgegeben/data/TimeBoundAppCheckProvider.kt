package com.aus.ausgegeben.data

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.AppCheckProvider
import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.AppCheckToken
import java.util.concurrent.TimeoutException

/**
 * Caps how long an App Check attestation may hold up Firebase.
 *
 * Firestore and Auth wait for an App Check token before every request. A Play Integrity
 * attestation normally takes a second or two, but on a phone whose key-provisioning
 * service (RKPD) is unresponsive Android's keystore gives up only after 10 s
 * ("Failed to get rkpd key … Waiting for RKPD: Elapsed"), so every save made right after
 * launch waited ~10.7 s. With enforcement off a missing token costs nothing — the SDK sends
 * a placeholder — so waiting longer than [timeoutMs] only makes the app slow.
 *
 * - An attestation slower than [timeoutMs] fails this call; the attestation keeps running.
 * - If it later succeeds, the next call returns that token at once (the SDK then caches and
 *   persists it for its TTL, so later launches skip attestation entirely).
 * - After a timeout or failure, calls fail immediately for [backoffMs] instead of each
 *   waiting out the timeout again.
 */
internal class TimeBoundAppCheckProvider(
    private val delegate: AppCheckProvider,
    private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    private val backoffMs: Long = DEFAULT_BACKOFF_MS,
    private val clock: () -> Long = System::currentTimeMillis,
    private val schedule: (delayMs: Long, action: () -> Unit) -> Unit = mainThreadScheduler(),
) : AppCheckProvider {

    private val lock = Any()
    private var inFlight: Task<AppCheckToken>? = null
    private var lateToken: AppCheckToken? = null
    private var failFastUntil = 0L

    override fun getToken(): Task<AppCheckToken> {
        val attempt: Task<AppCheckToken>
        synchronized(lock) {
            val now = clock()
            lateToken?.let { token ->
                lateToken = null
                if (token.expireTimeMillis - now > MIN_REMAINING_MS) return Tasks.forResult(token)
            }
            if (now < failFastUntil) {
                return Tasks.forException(TimeoutException("App Check attestation recently timed out"))
            }
            attempt = inFlight ?: delegate.getToken().also { started ->
                inFlight = started
                started.addOnCompleteListener(DIRECT) { done -> onAttemptFinished(started, done) }
            }
        }

        val result = TaskCompletionSource<AppCheckToken>()
        attempt.addOnCompleteListener(DIRECT) { done ->
            val delivered = if (done.isSuccessful) {
                result.trySetResult(done.result)
            } else {
                result.trySetException(done.exception ?: IllegalStateException("App Check attestation failed"))
            }
            // Delivered in time: the SDK caches it, so don't hand it out a second time.
            if (delivered && done.isSuccessful) synchronized(lock) { if (lateToken === done.result) lateToken = null }
        }
        schedule(timeoutMs) {
            if (result.trySetException(TimeoutException("App Check attestation took over $timeoutMs ms"))) {
                synchronized(lock) { failFastUntil = clock() + backoffMs }
                Log.w(TAG, "App Check attestation exceeded ${timeoutMs}ms; continuing without waiting")
            }
        }
        return result.task
    }

    private fun onAttemptFinished(started: Task<AppCheckToken>, done: Task<AppCheckToken>) {
        synchronized(lock) {
            if (inFlight === started) inFlight = null
            if (done.isSuccessful) {
                lateToken = done.result
                failFastUntil = 0L
            } else {
                failFastUntil = clock() + backoffMs
            }
        }
    }

    class Factory(
        private val delegate: AppCheckProviderFactory,
        private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    ) : AppCheckProviderFactory {
        override fun create(firebaseApp: FirebaseApp): AppCheckProvider =
            TimeBoundAppCheckProvider(delegate.create(firebaseApp), timeoutMs)
    }

    companion object {
        private const val TAG = "AppCheckTimeout"
        const val DEFAULT_TIMEOUT_MS = 3_000L
        const val DEFAULT_BACKOFF_MS = 5 * 60_000L

        /** Matches the SDK's own refresh buffer: tokens closer to expiry are not reused. */
        private const val MIN_REMAINING_MS = 5 * 60_000L

        private val DIRECT = java.util.concurrent.Executor { it.run() }

        private fun mainThreadScheduler(): (Long, () -> Unit) -> Unit {
            val handler = Handler(Looper.getMainLooper())
            return { delayMs, action -> handler.postDelayed(action, delayMs) }
        }
    }
}
