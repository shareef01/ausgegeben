package com.aus.ausgegeben.notification

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
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

            // No self-rescheduling: ReminderScheduler now enqueues periodic work, so
            // WorkManager owns the next run. Re-enqueueing from in here is what grew the
            // unique-work chain without bound and let one failed node kill the whole chain.
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
