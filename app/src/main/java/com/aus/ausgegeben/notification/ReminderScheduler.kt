package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.aus.ausgegeben.data.PreferenceManager
import java.util.Calendar
import java.util.concurrent.TimeUnit

object ReminderScheduler {

    internal const val WORK_NAME = "daily_spending_reminder"
    private const val REPEAT_INTERVAL_HOURS = 24L

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
    suspend fun scheduleNext(context: Context) {
        val (hour, minute) = PreferenceManager(context).reminderTime()
        val request = PeriodicWorkRequestBuilder<DailyReminderWorker>(
            REPEAT_INTERVAL_HOURS,
            TimeUnit.HOURS,
        )
            .setInitialDelay(millisUntilNextReminder(hour, minute), TimeUnit.MILLISECONDS)
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
