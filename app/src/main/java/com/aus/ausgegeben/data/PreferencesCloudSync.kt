package com.aus.ausgegeben.data

import android.util.Log
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Last-write-wins sync for settings prefs — same doc as web:
 * `users/{uid}/settings/preferences`
 */
class PreferencesCloudSync(
    private val preferenceManager: PreferenceManager,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private var registration: ListenerRegistration? = null
    private var pushJob: Job? = null
    private var activeUid: String? = null
    private var activeScope: CoroutineScope? = null
    @Volatile private var suppressPush = false
    @Volatile private var lastWrittenAt = 0L

    private val _syncError = MutableStateFlow<String?>(null)
    /** Non-null when the last push/pull to `users/{uid}/settings/preferences` failed. */
    val syncError: StateFlow<String?> = _syncError.asStateFlow()

    fun start(uid: String, scope: CoroutineScope) {
        if (activeUid == uid && registration != null) return
        stop()
        activeUid = uid
        activeScope = scope
        val ref = firestore
            .collection("users")
            .document(uid)
            .collection("settings")
            .document("preferences")

        registration = ref.addSnapshotListener { snap, error ->
            if (error != null) {
                Log.w(TAG, "preferences listener error", error)
                _syncError.value = error.message ?: "listener error"
                return@addSnapshotListener
            }
            scope.launch(Dispatchers.IO) {
                val localAt = preferenceManager.preferencesUpdatedAt()
                if (snap == null || !snap.exists()) {
                    writeRemote(uid, preferenceManager.snapshotSyncedPreferences())
                    return@launch
                }
                val remote = parseRemote(snap.data) ?: return@launch
                when {
                    remote.updatedAt > localAt -> applyRemote(remote)
                    localAt > remote.updatedAt -> writeRemote(uid, preferenceManager.snapshotSyncedPreferences())
                    else -> _syncError.value = null
                }
            }
        }

        pushJob = scope.launch(Dispatchers.IO) {
            preferenceManager.preferencesUpdatedAtFlow.collectLatest { at ->
                if (suppressPush || activeUid != uid) return@collectLatest
                if (at <= lastWrittenAt) return@collectLatest
                writeRemote(uid, preferenceManager.snapshotSyncedPreferences())
            }
        }
    }

    fun stop() {
        registration?.remove()
        registration = null
        pushJob?.cancel()
        pushJob = null
        activeUid = null
        activeScope = null
        suppressPush = false
        lastWrittenAt = 0L
        _syncError.value = null
    }

    /** Re-attempt the last push after a failure (e.g. user tapped retry on the sync error banner). */
    fun retry() {
        val uid = activeUid ?: return
        val scope = activeScope ?: return
        scope.launch(Dispatchers.IO) {
            lastWrittenAt = 0L
            writeRemote(uid, preferenceManager.snapshotSyncedPreferences())
        }
    }

    private suspend fun applyRemote(remote: SyncedPreferences) {
        suppressPush = true
        try {
            preferenceManager.applySyncedPreferences(remote)
            preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
            lastWrittenAt = remote.updatedAt
            _syncError.value = null
            withContext(Dispatchers.Main) {
                AppCompatDelegate.setApplicationLocales(
                    LocaleListCompat.forLanguageTags(remote.locale),
                )
            }
        } finally {
            suppressPush = false
        }
    }

    private suspend fun writeRemote(uid: String, prefs: SyncedPreferences) {
        var payload = prefs
        if (payload.updatedAt <= 0L) {
            val stamped = preferenceManager.ensurePreferencesTimestamp()
            payload = preferenceManager.snapshotSyncedPreferences().copy(updatedAt = stamped)
        }
        if (payload.updatedAt == lastWrittenAt) return
        lastWrittenAt = payload.updatedAt
        try {
            firestore
                .collection("users")
                .document(uid)
                .collection("settings")
                .document("preferences")
                .set(payload.toFirestoreMap(), SetOptions.merge())
                .await()
            preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
            _syncError.value = null
        } catch (e: Exception) {
            Log.w(TAG, "failed to write preferences", e)
            _syncError.value = e.message ?: "write failed"
        }
    }

    companion object {
        private const val TAG = "PreferencesCloudSync"
        private val VALID_LOCALES = setOf("en", "de")

        // Same set as web preferencesSync.VALID_THEMES
        private val VALID_THEMES = setOf(
            "light", "dark", "system", "amoled", "midnight",
            "ocean", "forest", "sunset", "lavender", "soft_light",
        )

        internal fun parseRemote(raw: Map<String, Any>?): SyncedPreferences? {
            if (raw == null) return null
            val locale = raw["locale"] as? String ?: return null
            val themeMode = raw["themeMode"] as? String ?: return null
            if (locale !in VALID_LOCALES) return null
            if (themeMode !in VALID_THEMES) return null
            val updatedAt = when (val v = raw["updatedAt"]) {
                is Long -> v
                is Number -> v.toLong()
                else -> 0L
            }
            val monthlyBudget = when (val v = raw["monthlyBudget"]) {
                is Number -> v.toDouble().takeIf { it > 0 }
                else -> null
            }
            // Existing cloud prefs docs predate this field — treat missing as already onboarded
            // (matches web's parseRemote), so a legacy doc never re-triggers onboarding.
            val onboardingComplete = raw["onboardingComplete"] as? Boolean ?: true
            return SyncedPreferences(
                currency = (raw["currency"] as? String)?.takeIf { it.isNotBlank() } ?: "EUR",
                locale = locale,
                themeMode = themeMode,
                onboardingComplete = onboardingComplete,
                dailyReminder = raw["dailyReminder"] as? Boolean ?: true,
                reminderHour = ((raw["reminderHour"] as? Number)?.toInt() ?: 19).coerceIn(0, 23),
                reminderMinute = ((raw["reminderMinute"] as? Number)?.toInt() ?: 0).coerceIn(0, 59),
                analyticsPeriod = raw["analyticsPeriod"] as? String ?: "this_month",
                monthlyBudget = monthlyBudget,
                updatedAt = updatedAt,
            )
        }

        private fun SyncedPreferences.toFirestoreMap(): Map<String, Any?> = mapOf(
            "currency" to currency,
            "locale" to locale,
            "themeMode" to themeMode,
            "onboardingComplete" to onboardingComplete,
            "dailyReminder" to dailyReminder,
            "reminderHour" to reminderHour,
            "reminderMinute" to reminderMinute,
            "analyticsPeriod" to analyticsPeriod,
            "monthlyBudget" to monthlyBudget,
            "updatedAt" to updatedAt,
        )
    }
}
