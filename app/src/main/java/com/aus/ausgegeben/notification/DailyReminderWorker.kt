package com.aus.ausgegeben.notification

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.localDayStartMillis
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

class DailyReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val preferenceManager = PreferenceManager(applicationContext)
        if (!preferenceManager.isDailyReminderEnabled()) {
            ReminderScheduler.scheduleNext(applicationContext)
            return Result.success()
        }

        val auth = AuthRepository(applicationContext)
        val uid = auth.currentUserId ?: return Result.success()
        val dayStart = localDayStartMillis(System.currentTimeMillis())
        val dayEnd = dayStart + 24 * 60 * 60 * 1000L
        val firestore = FirebaseFirestore.getInstance()
        val loggedToday = firestore.collection("users").document(uid)
            .collection("expenses")
            .whereGreaterThanOrEqualTo("dateMillis", dayStart)
            .whereLessThan("dateMillis", dayEnd)
            .get().await().documents.isNotEmpty()

        if (!loggedToday) {
            NotificationHelper.showDailyReminder(applicationContext)
        }

        ReminderScheduler.scheduleNext(applicationContext)
        return Result.success()
    }
}
