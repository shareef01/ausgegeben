package com.aus.ausgegeben.data.cloud

import android.content.Context
import com.aus.ausgegeben.R
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.TimeoutCancellationException

fun mapCloudSyncError(context: Context, error: Throwable): String {
    if (error is TimeoutCancellationException) {
        return context.getString(R.string.settings_sync_error_timeout)
    }
    if (error is FirebaseFirestoreException) {
        return when (error.code) {
            FirebaseFirestoreException.Code.PERMISSION_DENIED ->
                context.getString(R.string.settings_sync_error_permission)
            FirebaseFirestoreException.Code.UNAVAILABLE ->
                context.getString(R.string.settings_sync_error_network)
            FirebaseFirestoreException.Code.NOT_FOUND ->
                context.getString(R.string.settings_sync_error_firestore_missing)
            else -> context.getString(
                R.string.settings_sync_failed_detail,
                error.message ?: error.code.name,
            )
        }
    }
    val message = error.message?.takeIf { it.isNotBlank() }
    return if (message != null) {
        context.getString(R.string.settings_sync_failed_detail, message)
    } else {
        context.getString(R.string.settings_sync_failed)
    }
}
