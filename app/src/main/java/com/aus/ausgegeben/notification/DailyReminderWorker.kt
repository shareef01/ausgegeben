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
            // This is the one place that reads expenses without going through
            // AppRepository, so repository-level invariants do not reach it: legacy
            // soft-deleted rows have to be skipped here too, or one dated today makes
            // the reminder think something was logged and stay silent.
            //
            // Deliberately unlimited. `deleted` is absent on most rows so it cannot be
            // filtered server-side, and any limit() would have to be applied before
            // that client-side check — enough soft-deleted rows dated today would then
            // empty the page and fire a reminder at someone who did log. This reads one
            // day of transactions once a day, which is nothing against the 50k/day
            // Spark budget; sumMonthExpenses is the query that needed the aggregate,
            // because it runs on every save over a whole month.
            val loggedToday = firestoreClient.get().collection("users").document(uid)
                .collection("expenses")
                .whereGreaterThanOrEqualTo("dateMillis", dayStart)
                .whereLessThan("dateMillis", dayEnd)
                .get().await().documents
                .any { it.getBoolean("deleted") != true }

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
