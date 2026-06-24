package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.aus.ausgegeben.data.AusgegebenDatabase
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.util.localDayStartMillis

class DailyReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val preferenceManager = PreferenceManager(applicationContext)
        val remindersEnabled = preferenceManager.isDailyReminderEnabled()
        if (!remindersEnabled) {
            ReminderScheduler.scheduleNext(applicationContext)
            return Result.success()
        }

        val database = AusgegebenDatabase.getDatabase(applicationContext)
        val expenseDao = database.expenseDao()
        val dayStart = localDayStartMillis(System.currentTimeMillis())
        val dayEnd = dayStart + 24 * 60 * 60 * 1000L
        val loggedToday = expenseDao.countInDateRange(dayStart, dayEnd) > 0

        if (!loggedToday) {
            NotificationHelper.showDailyReminder(applicationContext)
        }

        ReminderScheduler.scheduleNext(applicationContext)
        return Result.success()
    }
}
