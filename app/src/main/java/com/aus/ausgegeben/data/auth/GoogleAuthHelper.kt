package com.aus.ausgegeben.data.auth

import android.content.Context
import com.aus.ausgegeben.data.cloud.FirebaseConfigHelper

object GoogleAuthHelper {
    /**
     * Gate for the Google sign-in button. Keep this false until the app's SHA-1
     * fingerprint is registered in Firebase (which adds an Android OAuth client,
     * client_type 1, to google-services.json). Without it, Google rejects the
     * token request and the picker errors out. Flip to true once configured.
     */
    const val GOOGLE_SIGN_IN_ENABLED = false

    fun isGoogleSignInAvailable(context: Context): Boolean {
        if (!GOOGLE_SIGN_IN_ENABLED) return false
        if (FirebaseConfigHelper.isPlaceholderConfig(context)) return false
        return !webClientId(context).isNullOrBlank()
    }

    fun webClientId(context: Context): String? {
        val resId = context.resources.getIdentifier(
            "default_web_client_id",
            "string",
            context.packageName,
        )
        if (resId == 0) return null
        val value = context.getString(resId)
        if (value.isBlank() || value.contains("YOUR_", ignoreCase = true)) return null
        return value
    }
}
