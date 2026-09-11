package com.aus.ausgegeben.data

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.PersistentCacheSettings
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the live [FirebaseFirestore] instance so sign-out can terminate it, wipe the
 * on-disk offline cache, and install a fresh instance for the next account.
 */
@Singleton
class FirestoreClient @Inject constructor() {
    @Volatile
    private var db: FirebaseFirestore = FirebaseFirestore.getInstance()

    fun get(): FirebaseFirestore = db

    /**
     * Drop the offline disk cache after listeners have detached. Failure is surfaced:
     * callers must not claim sensitive local data was removed when it was not.
     */
    suspend fun clearOfflineCache() {
        // Give per-user snapshot listeners a beat to remove after auth → null.
        delay(400)
        val old = db
        var failure: Exception? = null
        try {
            old.terminate().await()
            old.clearPersistence().await()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            Log.w(TAG, "Failed to clear Firestore offline cache", e)
            failure = e
        }
        val fresh = FirebaseFirestore.getInstance()
        fresh.firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setLocalCacheSettings(
                PersistentCacheSettings.newBuilder()
                    .setSizeBytes(CACHE_SIZE_BYTES)
                    .build(),
            )
            .build()
        db = fresh
        failure?.let { throw it }
    }

    companion object {
        private const val TAG = "FirestoreClient"
        const val CACHE_SIZE_BYTES = 100L * 1024L * 1024L
    }
}
