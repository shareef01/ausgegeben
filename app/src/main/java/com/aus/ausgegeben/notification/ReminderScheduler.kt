package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.flow.first
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
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
     * poison.
     *
     * AUS-301: this used to replace the work on every call, and MainActivity calls it on
     * every launch. WorkManager runs work late (the request also needs a network), so at
     * 19:05 today's 19:00 run can still be waiting. Replacing it then re-anchored the
     * schedule to tomorrow 19:00 and that day's reminder never came. Now the existing work
     * is kept when it was scheduled for the same hour:minute in the same time zone, which
     * covers app launches and reboots (WorkManager keeps its work across a reboot). The
     * work is replaced only when the time or time zone changed, or when there is none:
     * reminders just turned on, or work enqueued before this tag existed.
     */
    suspend fun scheduleNext(
        context: Context,
        hour: Int = 19,
        minute: Int = 0,
        zoneId: String = TimeZone.getDefault().id,
    ) {
        val config = configTag(hour, minute, zoneId)
        val current = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWorkFlow(WORK_NAME)
            .first()
        if (current.any { !it.state.isFinished && config in it.tags }) return
        enqueue(context, millisUntilNextReminder(hour, minute), config)
    }

    /** Marks a request with the schedule it was built for; see [scheduleNext]. */
    internal fun configTag(hour: Int, minute: Int, zoneId: String): String =
        // Locale.ROOT: a default locale with other digits would change the tag text.
        String.format(Locale.ROOT, "%s%02d:%02d@%s", CONFIG_TAG_PREFIX, hour, minute, zoneId)

    private const val CONFIG_TAG_PREFIX = "reminder-config:"

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
        enqueue(
            context,
            millisUntilReminderAtLeastHalfADayAway(hour, minute),
            configTag(hour, minute, TimeZone.getDefault().id),
        )
    }

    private fun enqueue(context: Context, initialDelayMs: Long, configTag: String) {
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
            .addTag(configTag)
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
