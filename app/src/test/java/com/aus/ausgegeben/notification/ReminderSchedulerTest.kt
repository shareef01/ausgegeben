package com.aus.ausgegeben.notification

import android.app.Application
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Regression cover for the reminder scheduling shape.
 *
 * The bug this pins: DailyReminderWorker used to re-enqueue itself with APPEND_OR_REPLACE
 * from inside doWork(), which appended a node to the unique-work chain on every run and on
 * every retry. The chain grew forever, and since appended work is dependent work, one
 * cancelled node killed every run queued behind it. Periodic work has no chain at all, so
 * repeated scheduling has to stay at exactly one work item.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class ReminderSchedulerTest {

    private lateinit var context: Application

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(Log.DEBUG)
            .setExecutor(SynchronousExecutor())
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)
    }

    private fun reminderWorkInfos(): List<WorkInfo> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(ReminderScheduler.WORK_NAME)
            .get()

    @Test
    fun scheduleNext_enqueuesExactlyOneReminder() = runTest {
        ReminderScheduler.scheduleNext(context)

        val infos = reminderWorkInfos()
        assertEquals(1, infos.size)
        assertEquals(WorkInfo.State.ENQUEUED, infos.single().state)
    }

    @Test
    fun scheduleNext_repeatedCallsDoNotGrowTheWorkChain() = runTest {
        // Stands in for an app launch, a reboot, and a settings change all re-anchoring.
        repeat(5) { ReminderScheduler.scheduleNext(context) }

        assertEquals(1, reminderWorkInfos().size)
    }

    @Test
    fun cancel_leavesNoPendingReminder() = runTest {
        ReminderScheduler.scheduleNext(context)
        ReminderScheduler.cancel(context)

        val pending = reminderWorkInfos().filterNot { it.state.isFinished }
        assertTrue("expected no pending reminder work, got $pending", pending.isEmpty())
    }

    @Test
    fun scheduleNext_afterCancel_reschedules() = runTest {
        ReminderScheduler.scheduleNext(context)
        ReminderScheduler.cancel(context)
        ReminderScheduler.scheduleNext(context)

        val pending = reminderWorkInfos().filterNot { it.state.isFinished }
        assertEquals(1, pending.size)
    }

    private fun berlin(year: Int, month: Int, day: Int, hour: Int, minute: Int): Calendar =
        Calendar.getInstance(TimeZone.getTimeZone("Europe/Berlin")).apply {
            clear()
            set(year, month - 1, day, hour, minute, 0)
        }

    @Test
    fun millisFromNearestSlot_seesTheDstShiftButNotOrdinaryJitter() {
        // The first run after spring-forward lands at 20:00 local for a 19:00 slot.
        assertEquals(TimeUnit.HOURS.toMillis(1), ReminderScheduler.millisFromNearestSlot(19, 0, berlin(2026, 3, 30, 20, 0)))
        assertTrue(ReminderScheduler.millisFromNearestSlot(19, 0, berlin(2026, 3, 30, 19, 10)) <= ReminderScheduler.DRIFT_TOLERANCE_MS)
        // A late run just after midnight is measured against yesterday's 23:50 slot.
        assertEquals(TimeUnit.MINUTES.toMillis(20), ReminderScheduler.millisFromNearestSlot(23, 50, berlin(2026, 6, 2, 0, 10)))
    }

    @Test
    fun reanchor_landsOnTheSlotAtLeastHalfADayOut() {
        // Early run (fall-back: 18:00 for a 19:00 slot) must not fire again in an hour.
        val early = berlin(2026, 10, 26, 18, 0)
        val delay = ReminderScheduler.millisUntilReminderAtLeastHalfADayAway(19, 0, early)
        val target = (early.clone() as Calendar).apply { timeInMillis += delay }
        assertEquals(27, target.get(Calendar.DAY_OF_MONTH))
        assertEquals(19, target.get(Calendar.HOUR_OF_DAY))
        assertEquals(0, target.get(Calendar.MINUTE))
        // Across the spring-forward night the wall-clock slot still holds (23h, not 24h).
        val beforeSpring = berlin(2026, 3, 28, 20, 0)
        assertEquals(TimeUnit.HOURS.toMillis(22), ReminderScheduler.millisUntilReminderAtLeastHalfADayAway(19, 0, beforeSpring))
    }

    @Test
    fun millisUntilNextReminder_staysWithinOneDayAndNeverFiresImmediately() {
        val oneDayMs = TimeUnit.DAYS.toMillis(1)
        for (hour in 0..23) {
            val delay = ReminderScheduler.millisUntilNextReminder(hour, 0)
            // Floor of 60s so a target that just elapsed cannot schedule at zero delay.
            assertTrue("hour=$hour delay=$delay", delay >= 60_000L)
            assertTrue("hour=$hour delay=$delay", delay <= oneDayMs)
        }
    }
}
