package com.aus.ausgegeben

import android.app.Application
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.aus.ausgegeben.data.FirestoreClient
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class AusgegebenApplication : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

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
            // Cap offline cache (~100 MiB) so financial history cannot grow unbounded on disk.
            .setCacheSizeBytes(FirestoreClient.CACHE_SIZE_BYTES)
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
        val factory = resolveAppCheckFactory()
            ?: if (BuildConfig.DEBUG) {
                Log.w(TAG, "App Check provider unavailable in debug")
                return
            } else {
                error("App Check provider required in release")
            }
        try {
            FirebaseAppCheck.getInstance().installAppCheckProviderFactory(factory)
            if (BuildConfig.DEBUG) {
                // Warm + register: exchange creates/loads the persisted secret.
                FirebaseAppCheck.getInstance().getAppCheckToken(false)
                    .addOnSuccessListener {
                        Log.i(TAG, "App Check debug token ready")
                        maybeLogStoredAppCheckDebugSecret()
                    }
                    .addOnFailureListener { e ->
                        maybeLogStoredAppCheckDebugSecret()
                        Log.e(
                            TAG,
                            "App Check debug token exchange failed — register the secret above in Firebase Console",
                            e,
                        )
                    }
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                Log.w(TAG, "App Check provider install failed", e)
            } else {
                throw e
            }
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

    /**
     * Firebase only Log.d's the debug secret. Opt in via
     * `adb shell setprop debug.ausgegeben.log_appcheck_secret 1` so shared test
     * devices do not leak it to every logcat dump by default.
     */
    private fun maybeLogStoredAppCheckDebugSecret() {
        if (!BuildConfig.DEBUG) return
        val requested = try {
            val clazz = Class.forName("android.os.SystemProperties")
            clazz.getMethod("get", String::class.java, String::class.java)
                .invoke(null, "debug.ausgegeben.log_appcheck_secret", "") == "1"
        } catch (_: Exception) {
            false
        }
        if (!requested) return
        try {
            val dir = java.io.File(applicationInfo.dataDir, "shared_prefs")
            dir.listFiles()
                ?.filter { it.name.startsWith("com.google.firebase.appcheck.debug.store.") }
                ?.forEach { file ->
                    val match = Regex(
                        """com\.google\.firebase\.appcheck\.debug\.DEBUG_SECRET["']?\s*>\s*([^<]+)""",
                    ).find(file.readText())
                    val found = match?.groupValues?.getOrNull(1)?.trim()
                    if (!found.isNullOrBlank()) {
                        Log.i(TAG, "App Check debug secret (register in Console): $found")
                    }
                }
        } catch (e: Exception) {
            Log.w(TAG, "Could not read App Check debug secret", e)
        }
    }

    companion object {
        private const val TAG = "AusgegebenApp"
    }
}
