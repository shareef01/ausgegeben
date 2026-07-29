package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.aus.ausgegeben.data.PreferenceManager
import java.util.Calendar
import java.util.concurrent.TimeUnit

object ReminderScheduler {

    private const val WORK_NAME = "daily_spending_reminder"

    /**
     * Enqueues the next reminder, re-anchored to the configured hour:minute so
     * the schedule self-corrects instead of drifting.
     *
     * [policy] exists because DailyReminderWorker reschedules from inside its own
     * doWork(). REPLACE stops RUNNING work, so the worker would cancel itself —
     * every run recorded CANCELLED with a WorkerStoppedException and Result.success()
     * was never reached. The worker passes APPEND_OR_REPLACE to queue the next run
     * behind itself; external callers keep REPLACE so a settings change wins outright.
     */
    suspend fun scheduleNext(
        context: Context,
        policy: ExistingWorkPolicy = ExistingWorkPolicy.REPLACE,
    ) {
        val (hour, minute) = PreferenceManager(context).reminderTime()
        val delayMs = millisUntilNextReminder(hour, minute)
        val request = OneTimeWorkRequestBuilder<DailyReminderWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .addTag(WORK_NAME)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            policy,
            request
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    private fun millisUntilNextReminder(hour: Int, minute: Int): Long {
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
