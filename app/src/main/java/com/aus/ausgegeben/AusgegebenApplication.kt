package com.aus.ausgegeben

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings

class AusgegebenApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this)
        }
        installAppCheck()
        // Spark-compatible: cache Firestore locally for offline / faster reloads
        FirebaseFirestore.getInstance().firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setPersistenceEnabled(true)
            .setCacheSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
            .build()
    }

    private fun installAppCheck() {
        val factory = resolveAppCheckFactory() ?: return
        try {
            FirebaseAppCheck.getInstance().installAppCheckProviderFactory(factory)
        } catch (e: Exception) {
            Log.w(TAG, "App Check provider install failed", e)
        }
    }

    /**
     * Debug builds use the debug provider (token in logcat → Firebase Console).
     * Loaded via reflection so release compiles without the debug-only dependency.
     */
    private fun resolveAppCheckFactory(): AppCheckProviderFactory? {
        if (BuildConfig.DEBUG) {
            return try {
                val clazz = Class.forName("com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory")
                clazz.getMethod("getInstance").invoke(null) as AppCheckProviderFactory
            } catch (e: Exception) {
                Log.w(TAG, "Debug App Check provider unavailable; falling back to Play Integrity", e)
                PlayIntegrityAppCheckProviderFactory.getInstance()
            }
        }
        return PlayIntegrityAppCheckProviderFactory.getInstance()
    }

    companion object {
        private const val TAG = "AusgegebenApp"
    }
}
