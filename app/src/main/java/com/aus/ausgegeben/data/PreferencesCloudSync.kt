package com.aus.ausgegeben.data

import android.util.Log
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import com.aus.ausgegeben.util.CurrencyUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Last-write-wins sync for settings prefs — same doc as web:
 * `users/{uid}/settings/preferences`
 */
@Singleton
class PreferencesCloudSync @Inject constructor(
    private val preferenceManager: PreferenceManager,
    private val firestoreClient: FirestoreClient,
    private val firebaseAuth: FirebaseAuth,
) {
    private val firestore get() = firestoreClient.get()
    private var registration: ListenerRegistration? = null
    private var pushJob: Job? = null
    private var activeUid: String? = null
    private var activeScope: CoroutineScope? = null
    @Volatile private var suppressPush = false
    @Volatile private var lastWrittenAt = 0L
    /**
     * Bumped by every [stop]. Snapshot handling and transactions run in coroutines that
     * outlive the listener which started them, so each one checks the generation it began
     * in before touching shared state. After an account switch, [PreferenceManager] holds
     * the next account's values: applying the previous account's winner there (budget,
     * currency) or marking it ready would show one account's preferences to another, and
     * last-write-wins could later push them onto the other account's document. Same guard
     * as web preferencesSync.ts `sessionGeneration`.
     */
    @Volatile private var generation = 0L

    private data class CommitResult(
        val wrote: Boolean,
        val winner: SyncedPreferences,
    )

    private val _syncError = MutableStateFlow<String?>(null)
    /** Non-null when the last push/pull to `users/{uid}/settings/preferences` failed. */
    val syncError: StateFlow<String?> = _syncError.asStateFlow()

    private val _preferencesReady = MutableStateFlow(false)
    /**
     * True after the first preferences snapshot for the active uid has been applied
     * (or failed safely). Used to defer locale-sensitive work like category seeding.
     */
    val preferencesReady: StateFlow<Boolean> = _preferencesReady.asStateFlow()

    /**
     * STOR-2: a sealed preference that exists locally but cannot be decrypted must
     * never be pushed to the cloud as its default — that would overwrite the user's
     * real synced values. [PreferenceManager.snapshotSyncedPreferences] throws
     * [PrefsCrypto.SealedValueUnreadableException] for that case; refuse the push and
     * surface a sync error instead of letting the exception kill the collecting
     * coroutine.
     */
    private suspend fun snapshotForPush(): SyncedPreferences? = try {
        preferenceManager.snapshotSyncedPreferences()
    } catch (e: PrefsCrypto.SealedValueUnreadableException) {
        Log.w(TAG, "local preferences unreadable; refusing to push defaults", e)
        _syncError.value = SYNC_ERROR_GENERIC
        null
    }

    fun start(uid: String, scope: CoroutineScope) {
        if (activeUid == uid && registration != null) return
        stop()
        activeUid = uid
        activeScope = scope
        _preferencesReady.value = false
        val session = generation
        fun current() = session == generation && activeUid == uid
        val ref = firestore
            .collection("users")
            .document(uid)
            .collection(FirestorePaths.SETTINGS_COLLECTION)
            .document(FirestorePaths.PREFERENCES_DOC)

        registration = ref.addSnapshotListener { snap, error ->
            if (!current()) return@addSnapshotListener
            if (error != null) {
                Log.w(TAG, "preferences listener error", error)
                _syncError.value = mapSyncFailure(error)
                _preferencesReady.value = true
                return@addSnapshotListener
            }
            scope.launch(Dispatchers.IO) {
                try {
                    if (!current()) return@launch
                    val localAt = preferenceManager.preferencesUpdatedAt()
                    if (snap == null) return@launch
                    if (!snap.exists()) {
                        // A cache-only "not found" is not the server's answer (an empty
                        // cache on a slow connection reports it). Creating the document
                        // from local values here stamped them "now", and the next server
                        // snapshot then lost last-write-wins to those defaults, overwriting
                        // the real cloud preferences. Web has the same rule (await_server).
                        if (shouldCreateFromLocal(exists = false, fromCache = snap.metadata.isFromCache)) {
                            snapshotForPush()?.let { writeRemote(uid, it, session) }
                        }
                        return@launch
                    }
                    val remote = parseRemote(snap.data) ?: return@launch
                    when (prefsLwwAction(remote.updatedAt, localAt)) {
                        PrefsLwwAction.APPLY_REMOTE -> applyRemote(remote)
                        PrefsLwwAction.PUSH_LOCAL -> snapshotForPush()?.let { writeRemote(uid, it, session) }
                        PrefsLwwAction.HOLD -> _syncError.value = null
                    }
                } finally {
                    if (current()) _preferencesReady.value = true
                }
            }
        }

        pushJob = scope.launch(Dispatchers.IO) {
            preferenceManager.preferencesUpdatedAtFlow.collectLatest { at ->
                if (suppressPush || activeUid != uid) return@collectLatest
                if (at <= lastWrittenAt) return@collectLatest
                snapshotForPush()?.let { writeRemote(uid, it, session) }
            }
        }
    }

    fun stop() {
        generation++
        registration?.remove()
        registration = null
        pushJob?.cancel()
        pushJob = null
        activeUid = null
        activeScope = null
        suppressPush = false
        lastWrittenAt = 0L
        _syncError.value = null
        _preferencesReady.value = false
    }

    fun retry() {
        val uid = activeUid ?: return
        val scope = activeScope ?: return
        val session = generation
        scope.launch(Dispatchers.IO) {
            lastWrittenAt = 0L
            snapshotForPush()?.let { writeRemote(uid, it, session) }
        }
    }

    private fun mapSyncFailure(error: Exception): String {
        return when {
            error is com.google.firebase.firestore.FirebaseFirestoreException &&
                error.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED ->
                SYNC_ERROR_PERMISSION
            error is com.google.firebase.firestore.FirebaseFirestoreException &&
                (error.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.UNAVAILABLE ||
                    error.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.DEADLINE_EXCEEDED) ->
                SYNC_ERROR_NETWORK
            else -> SYNC_ERROR_GENERIC
        }
    }

    private suspend fun applyRemote(remote: SyncedPreferences) {
        suppressPush = true
        lastWrittenAt = remote.updatedAt
        try {
            preferenceManager.applySyncedPreferences(remote)
            preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
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

    private suspend fun writeRemote(uid: String, prefs: SyncedPreferences, session: Long) {
        fun current() = session == generation && activeUid == uid
        if (!current()) return
        // Rules require email_verified — keep local-only until the user confirms.
        if (firebaseAuth.currentUser?.isEmailVerified != true) return
        var payload = prefs
        if (payload.updatedAt <= 0L) {
            val stamped = preferenceManager.ensurePreferencesTimestamp()
            payload = snapshotForPush()?.copy(updatedAt = stamped) ?: return
        }
        if (payload.updatedAt == lastWrittenAt) return
        try {
            val ref = firestore
                .collection("users")
                .document(uid)
                .collection(FirestorePaths.SETTINGS_COLLECTION)
                .document(FirestorePaths.PREFERENCES_DOC)
            val result = firestore.runTransaction { transaction ->
                val remote = parseRemote(transaction.get(ref).data)
                // Firestore retries this callback when another device commits first.
                // Equal clocks are first-writer-wins, so the result is deterministic
                // and a delayed stale write can never overwrite a newer document.
                if (remote != null && remote.updatedAt >= payload.updatedAt) {
                    CommitResult(wrote = false, winner = remote)
                } else {
                    transaction.set(ref, payload.toFirestoreMap(), SetOptions.merge())
                    CommitResult(wrote = true, winner = payload)
                }
            }.await()
            // Signed out or switched account while the transaction ran: its result
            // belongs to the previous session.
            if (!current()) return
            if (result.wrote) {
                lastWrittenAt = result.winner.updatedAt
            } else if (result.winner.updatedAt >= preferenceManager.preferencesUpdatedAt()) {
                applyRemote(result.winner)
            }
            preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
            _syncError.value = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            Log.w(TAG, "failed to write preferences", e)
            if (current()) _syncError.value = mapSyncFailure(e)
        }
    }

    companion object {
        private const val TAG = "PreferencesCloudSync"
        const val SYNC_ERROR_PERMISSION = "permission"
        const val SYNC_ERROR_NETWORK = "network"
        const val SYNC_ERROR_GENERIC = "generic"
        private val VALID_LOCALES = setOf("en", "de")
        private val VALID_CURRENCIES = setOf("EUR", "USD", "GBP", "CHF")
        private val ANALYTICS_PERIOD_REGEX = Regex("^(all_time|this_month|last_month|month:[0-9]{4}-(0[1-9]|1[0-2]))$")

        // Same set as web preferencesSync.VALID_THEMES
        private val VALID_THEMES = setOf(
            "light", "dark", "system", "amoled", "midnight",
            "ocean", "forest", "sunset", "lavender", "soft_light",
        )

        /**
         * Whether a snapshot proves the preferences document is absent, so local values
         * may become the document. Only the server can say that; see the listener.
         */
        internal fun shouldCreateFromLocal(exists: Boolean, fromCache: Boolean): Boolean =
            !exists && !fromCache

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
            val rawCurrency = raw["currency"] as? String
            val currency = if (rawCurrency in VALID_CURRENCIES) rawCurrency!! else "EUR"
            val rawPeriod = raw["analyticsPeriod"] as? String
            val analyticsPeriod = if (rawPeriod != null && ANALYTICS_PERIOD_REGEX.matches(rawPeriod)) {
                rawPeriod
            } else {
                "this_month"
            }

            return SyncedPreferences(
                currency = currency,
                locale = locale,
                themeMode = themeMode,
                onboardingComplete = onboardingComplete,
                dailyReminder = raw["dailyReminder"] as? Boolean ?: true,
                reminderHour = ((raw["reminderHour"] as? Number)?.toInt() ?: 19).coerceIn(0, 23),
                reminderMinute = ((raw["reminderMinute"] as? Number)?.toInt() ?: 0).coerceIn(0, 59),
                analyticsPeriod = analyticsPeriod,
                monthlyBudget = monthlyBudget,
                updatedAt = updatedAt,
            )
        }

        private fun SyncedPreferences.toFirestoreMap(): Map<String, Any?> = mapOf(
            "currency" to if (currency in VALID_CURRENCIES) currency else "EUR",
            "locale" to if (locale in VALID_LOCALES) locale else "en",
            "themeMode" to if (themeMode in VALID_THEMES) themeMode else "system",
            "onboardingComplete" to onboardingComplete,
            "dailyReminder" to dailyReminder,
            "reminderHour" to reminderHour.coerceIn(0, 23),
            "reminderMinute" to reminderMinute.coerceIn(0, 59),
            "analyticsPeriod" to if (ANALYTICS_PERIOD_REGEX.matches(analyticsPeriod)) analyticsPeriod else "this_month",
            // Rules reject a changed sub-cent budget; rounding also normalizes a legacy value.
            "monthlyBudget" to monthlyBudget?.takeIf { it > 0 }?.let(CurrencyUtils::roundAmount),
            "updatedAt" to updatedAt,
        )
    }
}
