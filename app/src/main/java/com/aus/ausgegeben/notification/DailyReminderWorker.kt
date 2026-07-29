package com.aus.ausgegeben.notification

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkerParameters
import com.aus.ausgegeben.data.FirestoreClient
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.localDayStartMillis
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.tasks.await

@HiltWorker
class DailyReminderWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val preferenceManager: PreferenceManager,
    private val authRepository: AuthRepository,
    private val firestoreClient: FirestoreClient,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            if (!preferenceManager.isDailyReminderEnabled()) {
                return Result.success()
            }

            val uid = authRepository.currentUserId ?: return Result.success()
            val dayStart = localDayStartMillis(System.currentTimeMillis())
            val dayEnd = dayStart + 24 * 60 * 60 * 1000L
            val loggedToday = firestoreClient.get().collection("users").document(uid)
                .collection("expenses")
                .whereGreaterThanOrEqualTo("dateMillis", dayStart)
                .whereLessThan("dateMillis", dayEnd)
                .get().await().documents.isNotEmpty()

            if (!loggedToday) {
                NotificationHelper.showDailyReminder(applicationContext)
            }

            // APPEND_OR_REPLACE, not the default REPLACE: this call runs while this
            // worker is still RUNNING, and REPLACE would cancel it mid-flight.
            ReminderScheduler.scheduleNext(applicationContext, ExistingWorkPolicy.APPEND_OR_REPLACE)
            Result.success()
        } catch (e: Exception) {
            Log.w(TAG, "daily reminder failed", e)
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "DailyReminderWorker"
    }
}
