package com.aus.ausgegeben.data.cloud

import android.content.Context
import com.aus.ausgegeben.R
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.TimeoutCancellationException

fun mapCloudSyncError(context: Context, error: Throwable): String {
    if (FirebaseConfigHelper.isPlaceholderConfig(context)) {
        return context.getString(R.string.settings_sync_error_config_placeholder)
    }

    val root = error.rootCause()
    if (root is TimeoutCancellationException) {
        return context.getString(R.string.settings_sync_error_timeout)
    }

    val firestoreError = root.findFirestoreException()
    if (firestoreError != null) {
        return when (firestoreError.code) {
            FirebaseFirestoreException.Code.PERMISSION_DENIED ->
                context.getString(R.string.settings_sync_error_permission)
            FirebaseFirestoreException.Code.UNAVAILABLE ->
                context.getString(R.string.settings_sync_error_network)
            FirebaseFirestoreException.Code.NOT_FOUND ->
                context.getString(R.string.settings_sync_error_firestore_missing)
            else -> context.getString(
                R.string.settings_sync_failed_detail,
                firestoreError.message ?: firestoreError.code.name,
            )
        }
    }

    val message = root.message?.takeIf { it.isNotBlank() }
        ?: error.message?.takeIf { it.isNotBlank() }
    return if (message != null) {
        if (message.contains("PERMISSION_DENIED", ignoreCase = true) ||
            message.contains("permission", ignoreCase = true)
        ) {
            context.getString(R.string.settings_sync_error_permission)
        } else {
            context.getString(R.string.settings_sync_failed_detail, message)
        }
    } else {
        context.getString(R.string.settings_sync_failed)
    }
}

private fun Throwable.rootCause(): Throwable {
    var current: Throwable = this
    while (current.cause != null && current.cause !== current) {
        current = current.cause!!
    }
    return current
}

private fun Throwable.findFirestoreException(): FirebaseFirestoreException? {
    var current: Throwable? = this
    while (current != null) {
        if (current is FirebaseFirestoreException) return current
        current = current.cause?.takeIf { it !== current }
    }
    return null
}
