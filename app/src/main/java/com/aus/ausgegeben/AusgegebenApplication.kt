package com.aus.ausgegeben

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings

class AusgegebenApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this)
        }
        val emulatorsHooked = maybeUseFirebaseEmulators()
        if (!emulatorsHooked) {
            installAppCheck()
        }
        // Spark-compatible: cache Firestore locally for offline / faster reloads
        FirebaseFirestore.getInstance().firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setPersistenceEnabled(true)
            .setCacheSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
            .build()
    }

    /**
     * Debug-only: route Auth/Firestore at the host machine's local emulators
     * (firebase.emulator.json) when `adb shell setprop debug.ausgegeben.fb_emulators 1`
     * was set before launch. Lets automated tests exercise the full app without
     * touching the production project. Never active in release builds.
     */
    private fun maybeUseFirebaseEmulators(): Boolean {
        if (!BuildConfig.DEBUG) return false
        val requested = try {
            val clazz = Class.forName("android.os.SystemProperties")
            clazz.getMethod("get", String::class.java, String::class.java)
                .invoke(null, "debug.ausgegeben.fb_emulators", "") == "1"
        } catch (_: Exception) {
            false
        }
        if (!requested) return false
        return try {
            // 10.0.2.2 = host loopback from the Android emulator
            FirebaseAuth.getInstance().useEmulator("10.0.2.2", 9099)
            FirebaseFirestore.getInstance().useEmulator("10.0.2.2", 8080)
            Log.i(TAG, "Using local Firebase emulators (auth:9099, firestore:8080)")
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to hook Firebase emulators", e)
            false
        }
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
