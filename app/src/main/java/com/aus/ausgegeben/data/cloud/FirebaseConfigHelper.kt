package com.aus.ausgegeben.data.cloud

import android.content.Context
import com.google.firebase.FirebaseApp

object FirebaseConfigHelper {
    fun projectId(context: Context): String? =
        runCatching { FirebaseApp.getInstance().options.projectId }.getOrNull()

    fun isPlaceholderConfig(context: Context): Boolean {
        val options = runCatching { FirebaseApp.getInstance().options }.getOrNull() ?: return false
        val apiKey = options.apiKey.orEmpty()
        val projectId = options.projectId.orEmpty()
        return apiKey.contains("Dummy", ignoreCase = true) ||
            projectId == "YOUR_PROJECT_ID" ||
            apiKey == "YOUR_API_KEY"
    }
}
