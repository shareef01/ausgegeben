package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Calendar
import java.util.concurrent.TimeUnit

object ReminderScheduler {

    internal const val WORK_NAME = "daily_spending_reminder"
    private const val REPEAT_INTERVAL_HOURS = 24L
    private const val HALF_DAY_MS = 12L * 60 * 60 * 1000

    /** Wider than normal WorkManager jitter, narrower than the one-hour DST shift. */
    internal const val DRIFT_TOLERANCE_MS = 30L * 60 * 1000

    /**
     * Enqueues the daily reminder as periodic work anchored to the configured hour:minute.
     *
     * This used to be a OneTimeWorkRequest that DailyReminderWorker re-enqueued from inside
     * its own doWork() with APPEND_OR_REPLACE, which had two defects:
     *
     *  - the unique-work chain grew by one node on every run (and again on every
     *    Result.retry()), accumulating in the WorkManager database indefinitely; and
     *  - appended work is *dependent* work, so one FAILED or CANCELLED node cancelled
     *    everything queued behind it and reminders stopped for good until something
     *    external rescheduled — silently, which is the worst way for this to fail.
     *
     * Periodic work drops the self-rescheduling entirely, so there is no chain to grow or
     * poison. CANCEL_AND_REENQUEUE re-anchors to the next hour:minute, which is what every
     * caller wants: a settings change, a reboot, or an app launch should each realign the
     * schedule rather than inherit a stale one.
     */
    suspend fun scheduleNext(context: Context, hour: Int = 19, minute: Int = 0) {
        enqueue(context, millisUntilNextReminder(hour, minute))
    }

    /**
     * Periodic work repeats every 24 elapsed hours, so a DST change shifts the reminder
     * by an hour until something re-anchors it. DailyReminderWorker calls this when a run
     * lands more than [DRIFT_TOLERANCE_MS] away from the slot. The next run is at least
     * 12 hours out, so re-anchoring after an early run can never fire twice in one day.
     *
     * This replaces the unique work rather than appending to it, so there is still no
     * chain to grow (see the scheduleNext comment). It also cancels the run that calls
     * it, which is why the worker calls it only after its own work is done.
     */
    suspend fun reanchorAfterDrift(context: Context, hour: Int, minute: Int) {
        enqueue(context, millisUntilReminderAtLeastHalfADayAway(hour, minute))
    }

    private fun enqueue(context: Context, initialDelayMs: Long) {
        val request = PeriodicWorkRequestBuilder<DailyReminderWorker>(
            REPEAT_INTERVAL_HOURS,
            TimeUnit.HOURS,
        )
            .setInitialDelay(initialDelayMs, TimeUnit.MILLISECONDS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .addTag(WORK_NAME)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
            request,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    /** How far [now] is from the nearest hour:minute slot, today's or an adjacent day's. */
    internal fun millisFromNearestSlot(hour: Int, minute: Int, now: Calendar = Calendar.getInstance()): Long {
        val slot = (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val today = kotlin.math.abs(now.timeInMillis - slot.timeInMillis)
        val yesterday = kotlin.math.abs(now.timeInMillis - (slot.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }.timeInMillis)
        val tomorrow = kotlin.math.abs(now.timeInMillis - (slot.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }.timeInMillis)
        return minOf(today, yesterday, tomorrow)
    }

    internal fun millisUntilReminderAtLeastHalfADayAway(
        hour: Int,
        minute: Int,
        now: Calendar = Calendar.getInstance(),
    ): Long {
        val target = (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        // Calendar.add keeps wall-clock time across a DST change, unlike adding 24h.
        while (target.timeInMillis - now.timeInMillis < HALF_DAY_MS) target.add(Calendar.DAY_OF_YEAR, 1)
        return target.timeInMillis - now.timeInMillis
    }

    internal fun millisUntilNextReminder(hour: Int, minute: Int): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (before(now) || !after(now)) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }
        return (target.timeInMillis - now.timeInMillis).coerceAtLeast(60_000L)
    }
}
