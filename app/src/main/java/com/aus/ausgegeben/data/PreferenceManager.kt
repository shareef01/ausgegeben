package com.aus.ausgegeben.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.ExportUtils
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import java.util.UUID

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

@Singleton
class PreferenceManager @Inject constructor(
    @ApplicationContext context: Context,
) : TransactionPreferences {
    // Always pin DataStore to the application context — callers often pass an Activity.
    private val context = context.applicationContext
    private val crypto = PrefsCrypto()

    private object PreferencesKeys {
        val CURRENCY = stringPreferencesKey("currency")
        val DARK_MODE = booleanPreferencesKey("dark_mode")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val ONBOARDING_COMPLETE = stringPreferencesKey("onboarding_complete_enc")
        val DAILY_REMINDER = stringPreferencesKey("daily_reminder_enc")
        val REMINDER_HOUR = stringPreferencesKey("reminder_hour_enc")
        val REMINDER_MINUTE = stringPreferencesKey("reminder_minute_enc")
        val ANALYTICS_PERIOD = stringPreferencesKey("analytics_period")
        val MONTHLY_BUDGET = stringPreferencesKey("monthly_budget")
        val LAST_CLOUD_SYNC_AT = stringPreferencesKey("last_cloud_sync_at")
        val LANGUAGE = stringPreferencesKey("language")
        /** LWW clock shared with web (`users/{uid}/settings/preferences.updatedAt`). */
        val PREFERENCES_UPDATED_AT = stringPreferencesKey("preferences_updated_at")
        val PENDING_EXPENSE_OPERATION_ID = stringPreferencesKey("pending_expense_operation_id_enc")
        val PENDING_EXPENSE_CREATED_AT = stringPreferencesKey("pending_expense_created_at_enc")
        // Legacy plaintext keys (migrated into sealed blobs on first read/write).
        val LEGACY_ONBOARDING = booleanPreferencesKey("onboarding_complete")
        val LEGACY_DAILY_REMINDER = booleanPreferencesKey("daily_reminder")
        val LEGACY_REMINDER_HOUR = intPreferencesKey("reminder_hour")
        val LEGACY_REMINDER_MINUTE = intPreferencesKey("reminder_minute")
    }

    private fun Preferences.sealedString(key: Preferences.Key<String>, default: String): String =
        crypto.open(this[key]) ?: default

    private fun Preferences.sealedBoolean(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Boolean>,
        default: Boolean,
    ): Boolean {
        this[key]?.let { return crypto.openBoolean(it, default) }
        return this[legacy] ?: default
    }

    private fun Preferences.sealedInt(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Int>,
        default: Int,
    ): Int {
        this[key]?.let { return crypto.openInt(it, default) }
        return this[legacy] ?: default
    }

    private fun dataFlow(): Flow<Preferences> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }

    val languageFlow: Flow<String> = dataFlow().map { it[PreferencesKeys.LANGUAGE] ?: "en" }

    override val currencyFlow: Flow<String> = dataFlow().map { prefs ->
        prefs.sealedString(PreferencesKeys.CURRENCY, "EUR")
    }

    val themeModeFlow: Flow<ThemeMode> = dataFlow().map { preferences ->
        preferences[PreferencesKeys.THEME_MODE]?.let { ThemeMode.fromStorageKey(it) }
            ?: when (preferences[PreferencesKeys.DARK_MODE]) {
                false -> ThemeMode.LIGHT
                true -> ThemeMode.DARK
                null -> ThemeMode.SYSTEM
            }
    }

    val onboardingCompleteFlow: Flow<Boolean> = dataFlow().map { preferences ->
        preferences.sealedBoolean(
            PreferencesKeys.ONBOARDING_COMPLETE,
            PreferencesKeys.LEGACY_ONBOARDING,
            false,
        )
    }

    val dailyReminderFlow: Flow<Boolean> = dataFlow().map { preferences ->
        preferences.sealedBoolean(
            PreferencesKeys.DAILY_REMINDER,
            PreferencesKeys.LEGACY_DAILY_REMINDER,
            true,
        )
    }

    suspend fun isDailyReminderEnabled(): Boolean = dailyReminderFlow.first()

    val reminderHourFlow: Flow<Int> = dataFlow().map { preferences ->
        preferences.sealedInt(
            PreferencesKeys.REMINDER_HOUR,
            PreferencesKeys.LEGACY_REMINDER_HOUR,
            19,
        )
    }

    val reminderMinuteFlow: Flow<Int> = dataFlow().map { preferences ->
        preferences.sealedInt(
            PreferencesKeys.REMINDER_MINUTE,
            PreferencesKeys.LEGACY_REMINDER_MINUTE,
            0,
        )
    }

    override val analyticsPeriodFlow: Flow<String> = dataFlow().map { prefs ->
        prefs.sealedString(
            PreferencesKeys.ANALYTICS_PERIOD,
            AnalyticsPeriod.THIS_MONTH.storageKey,
        )
    }

    override val monthlyBudgetFlow: Flow<Double?> = dataFlow().map { prefs ->
        crypto.open(prefs[PreferencesKeys.MONTHLY_BUDGET])
            ?.toDoubleOrNull()
            ?.takeIf { it > 0 }
    }

    val lastCloudSyncAtFlow: Flow<Long?> = dataFlow().map { preferences ->
        crypto.open(preferences[PreferencesKeys.LAST_CLOUD_SYNC_AT])?.toLongOrNull()
    }

    val preferencesUpdatedAtFlow: Flow<Long> = dataFlow()
        .map { preferences ->
            crypto.open(preferences[PreferencesKeys.PREFERENCES_UPDATED_AT])?.toLongOrNull() ?: 0L
        }
        .distinctUntilChanged()

    suspend fun preferencesUpdatedAt(): Long = preferencesUpdatedAtFlow.first()

    suspend fun reminderTime(): Pair<Int, Int> {
        val prefs = context.dataStore.data.first()
        val hour = prefs.sealedInt(
            PreferencesKeys.REMINDER_HOUR,
            PreferencesKeys.LEGACY_REMINDER_HOUR,
            19,
        )
        val minute = prefs.sealedInt(
            PreferencesKeys.REMINDER_MINUTE,
            PreferencesKeys.LEGACY_REMINDER_MINUTE,
            0,
        )
        return hour to minute
    }

    suspend fun snapshotSyncedPreferences(): SyncedPreferences {
        val prefs = context.dataStore.data.first()
        val theme = prefs[PreferencesKeys.THEME_MODE]?.let { ThemeMode.fromStorageKey(it) }
            ?: when (prefs[PreferencesKeys.DARK_MODE]) {
                false -> ThemeMode.LIGHT
                true -> ThemeMode.DARK
                null -> ThemeMode.SYSTEM
            }
        return SyncedPreferences(
            currency = prefs.sealedString(PreferencesKeys.CURRENCY, "EUR"),
            locale = prefs[PreferencesKeys.LANGUAGE] ?: "en",
            themeMode = theme.storageKey,
            onboardingComplete = prefs.sealedBoolean(
                PreferencesKeys.ONBOARDING_COMPLETE,
                PreferencesKeys.LEGACY_ONBOARDING,
                false,
            ),
            dailyReminder = prefs.sealedBoolean(
                PreferencesKeys.DAILY_REMINDER,
                PreferencesKeys.LEGACY_DAILY_REMINDER,
                true,
            ),
            reminderHour = prefs.sealedInt(
                PreferencesKeys.REMINDER_HOUR,
                PreferencesKeys.LEGACY_REMINDER_HOUR,
                19,
            ),
            reminderMinute = prefs.sealedInt(
                PreferencesKeys.REMINDER_MINUTE,
                PreferencesKeys.LEGACY_REMINDER_MINUTE,
                0,
            ),
            analyticsPeriod = prefs.sealedString(
                PreferencesKeys.ANALYTICS_PERIOD,
                AnalyticsPeriod.THIS_MONTH.storageKey,
            ),
            monthlyBudget = crypto.open(prefs[PreferencesKeys.MONTHLY_BUDGET])
                ?.toDoubleOrNull()
                ?.takeIf { it > 0 },
            updatedAt = crypto.open(prefs[PreferencesKeys.PREFERENCES_UPDATED_AT])?.toLongOrNull() ?: 0L,
        )
    }

    /** Apply cloud prefs without bumping updatedAt (uses remote clock). */
    suspend fun applySyncedPreferences(remote: SyncedPreferences) {
        val mode = ThemeMode.fromStorageKey(remote.themeMode)
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.CURRENCY, remote.currency)
            preferences[PreferencesKeys.LANGUAGE] = remote.locale
            preferences[PreferencesKeys.THEME_MODE] = mode.storageKey
            when (mode) {
                ThemeMode.LIGHT, ThemeMode.LAVENDER, ThemeMode.SOFT_LIGHT ->
                    preferences[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN, ThemeMode.FOREST, ThemeMode.SUNSET ->
                    preferences[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
            // Onboarding only ever moves false -> true; never let a stale/legacy remote doc re-trigger it.
            if (remote.onboardingComplete) {
                preferences.putSealedBoolean(PreferencesKeys.ONBOARDING_COMPLETE, true)
                preferences.remove(PreferencesKeys.LEGACY_ONBOARDING)
            }
            preferences.putSealedBoolean(PreferencesKeys.DAILY_REMINDER, remote.dailyReminder)
            preferences.remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
            preferences.putSealedInt(
                PreferencesKeys.REMINDER_HOUR,
                remote.reminderHour.coerceIn(0, 23),
            )
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            preferences.putSealedInt(
                PreferencesKeys.REMINDER_MINUTE,
                remote.reminderMinute.coerceIn(0, 59),
            )
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
            preferences.putSealed(PreferencesKeys.ANALYTICS_PERIOD, remote.analyticsPeriod)
            if (remote.monthlyBudget == null || remote.monthlyBudget <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences.putSealed(PreferencesKeys.MONTHLY_BUDGET, remote.monthlyBudget.toString())
            }
            preferences.putSealed(
                PreferencesKeys.PREFERENCES_UPDATED_AT,
                remote.updatedAt.toString(),
            )
        }
    }

    private fun MutablePreferences.putSealed(key: Preferences.Key<String>, plain: String) {
        this[key] = crypto.seal(plain)
    }

    private fun MutablePreferences.putSealedBoolean(key: Preferences.Key<String>, value: Boolean) {
        this[key] = crypto.sealBoolean(value)
    }

    private fun MutablePreferences.putSealedInt(key: Preferences.Key<String>, value: Int) {
        this[key] = crypto.sealInt(value)
    }

    private suspend fun touchEdit(block: MutablePreferences.() -> Unit) {
        context.dataStore.edit { preferences ->
            preferences.block()
            val previous = crypto.open(preferences[PreferencesKeys.PREFERENCES_UPDATED_AT])
                ?.toLongOrNull() ?: 0L
            val next = maxOf(System.currentTimeMillis(), previous + 1L)
            preferences.putSealed(PreferencesKeys.PREFERENCES_UPDATED_AT, next.toString())
        }
    }

    suspend fun updateCurrency(currency: String) {
        touchEdit { putSealed(PreferencesKeys.CURRENCY, currency) }
    }

    suspend fun updateThemeMode(mode: ThemeMode) {
        touchEdit {
            this[PreferencesKeys.THEME_MODE] = mode.storageKey
            when (mode) {
                ThemeMode.LIGHT, ThemeMode.LAVENDER, ThemeMode.SOFT_LIGHT ->
                    this[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN, ThemeMode.FOREST, ThemeMode.SUNSET ->
                    this[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
        }
    }

    suspend fun setOnboardingComplete() {
        touchEdit {
            putSealedBoolean(PreferencesKeys.ONBOARDING_COMPLETE, true)
            remove(PreferencesKeys.LEGACY_ONBOARDING)
        }
    }

    suspend fun updateDailyReminder(enabled: Boolean) {
        touchEdit {
            putSealedBoolean(PreferencesKeys.DAILY_REMINDER, enabled)
            remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
        }
    }

    suspend fun updateReminderTime(hour: Int, minute: Int) {
        touchEdit {
            putSealedInt(PreferencesKeys.REMINDER_HOUR, hour.coerceIn(0, 23))
            putSealedInt(PreferencesKeys.REMINDER_MINUTE, minute.coerceIn(0, 59))
            remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
        }
    }

    suspend fun updateAnalyticsPeriod(period: AnalyticsPeriod) {
        updateAnalyticsPeriodKey(period.storageKey)
    }

    override suspend fun updateAnalyticsPeriodKey(storageKey: String) {
        touchEdit { putSealed(PreferencesKeys.ANALYTICS_PERIOD, storageKey) }
    }

    suspend fun updateMonthlyBudget(amount: Double?) {
        touchEdit {
            if (amount == null || amount <= 0) {
                remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                putSealed(PreferencesKeys.MONTHLY_BUDGET, amount.toString())
            }
        }
    }

    suspend fun setLastCloudSyncAt(millis: Long) {
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.LAST_CLOUD_SYNC_AT, millis.toString())
        }
    }

    suspend fun updateLanguage(languageCode: String) {
        touchEdit { this[PreferencesKeys.LANGUAGE] = languageCode }
    }

    /**
     * Drop account-scoped local prefs on sign-out / account deletion so the next
     * user on a shared device does not see budget or sync metadata. Theme and
     * language stay as device chrome. Firestore offline cache is cleared
     * separately via [FirestoreClient.clearOfflineCache].
     */
    suspend fun clearAccountLocalState() {
        context.dataStore.edit { preferences ->
            preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            preferences.remove(PreferencesKeys.LAST_CLOUD_SYNC_AT)
            preferences.remove(PreferencesKeys.PREFERENCES_UPDATED_AT)
            preferences.remove(PreferencesKeys.CURRENCY)
            preferences.remove(PreferencesKeys.ANALYTICS_PERIOD)
            preferences.remove(PreferencesKeys.ONBOARDING_COMPLETE)
            preferences.remove(PreferencesKeys.LEGACY_ONBOARDING)
            preferences.remove(PreferencesKeys.DAILY_REMINDER)
            preferences.remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
            preferences.remove(PreferencesKeys.REMINDER_HOUR)
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            preferences.remove(PreferencesKeys.REMINDER_MINUTE)
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
            preferences.remove(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID)
            preferences.remove(PreferencesKeys.PENDING_EXPENSE_CREATED_AT)
        }
        // See STOR-1: a CSV export is app-private cache, not DataStore, but this is the
        // one function both sign-out and account deletion already call to clear local
        // account state, so it closes both paths with a single edit. Best-effort: a
        // cache-delete failure here must never prevent the caller's subsequent
        // Firestore offline-cache clear from running.
        runCatching { ExportUtils.clearExportCache(context) }
            .onFailure { e -> Log.w(TAG, "clearExportCache failed", e) }
    }

    /**
     * Mint and durably persist a fresh operation id for one explicit user submission.
     *
     * Identity here is a single submission *attempt*, never the semantic contents of an
     * expense: two transactions with identical amount/category/note/type entered seconds
     * apart are two legitimate, independent records. This always mints a new id and never
     * looks at (or is passed) the expense's field values, so two calls always identify two
     * distinct operations — see DATA-1. A genuine retry of the *same* attempt (e.g. a
     * transient-error retry still inside the same save() call) simply reuses the id the
     * caller already has; nothing here needs to be re-consulted for that case.
     *
     * Only one pending operation is tracked at a time: the ViewModel layer already
     * disables the Save action while a submission is in flight, so at most one attempt
     * per app process can ever be pending here.
     */
    override suspend fun beginExpenseSubmission(): String {
        val operationId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID, operationId)
            preferences.putSealed(PreferencesKeys.PENDING_EXPENSE_CREATED_AT, now.toString())
        }
        return operationId
    }

    /** Forget a submission's bookkeeping once its outcome (success or otherwise) is known. */
    override suspend fun completeExpenseSubmission(operationId: String) {
        context.dataStore.edit { preferences ->
            val storedId = crypto.open(preferences[PreferencesKeys.PENDING_EXPENSE_OPERATION_ID])
            if (storedId == operationId) {
                preferences.remove(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID)
                preferences.remove(PreferencesKeys.PENDING_EXPENSE_CREATED_AT)
            }
        }
    }

    /**
     * Resolve a pending entry left behind by a process death between a Firestore write
     * acknowledging and [completeExpenseSubmission] running.
     *
     * [exists] is asked whether that exact operation's document is already present
     * server-side. If so, the write already succeeded — the entry is only bookkeeping now
     * and is removed. This never attempts a write itself: it cannot resubmit a transaction
     * whose write never reached the server (the field values were deliberately never
     * persisted here), so such an entry is left alone until it ages past the cleanup grace
     * period, then dropped. Either outcome is safe: a genuinely new, later submission
     * always mints its own fresh id via [beginExpenseSubmission] and can never be matched
     * against — let alone collapsed into — a leftover entry from here.
     */
    override suspend fun reconcilePendingExpenseSubmissions(exists: suspend (String) -> Boolean) {
        val snapshot = context.dataStore.data.first()
        val storedId = crypto.open(snapshot[PreferencesKeys.PENDING_EXPENSE_OPERATION_ID]) ?: return
        val createdAt = crypto.open(snapshot[PreferencesKeys.PENDING_EXPENSE_CREATED_AT])?.toLongOrNull()
        val stale = createdAt == null || System.currentTimeMillis() - createdAt > PENDING_EXPENSE_TTL_MS
        val alreadyWritten = runCatching { exists(storedId) }.getOrDefault(false)
        if (!alreadyWritten && !stale) return // may still be genuinely in flight; leave it

        context.dataStore.edit { preferences ->
            val current = crypto.open(preferences[PreferencesKeys.PENDING_EXPENSE_OPERATION_ID])
            if (current == storedId) {
                preferences.remove(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID)
                preferences.remove(PreferencesKeys.PENDING_EXPENSE_CREATED_AT)
            }
        }
    }

    /** Ensure local LWW clock is non-zero before first cloud seed. */
    suspend fun ensurePreferencesTimestamp(): Long {
        val current = preferencesUpdatedAt()
        if (current > 0L) return current
        val now = System.currentTimeMillis()
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.PREFERENCES_UPDATED_AT, now.toString())
        }
        return now
    }

    companion object {
        private const val TAG = "PreferenceManager"

        // Purely a cleanup grace period — see reconcilePendingExpenseSubmissions. An
        // entry younger than this is left alone on the chance its write is still in
        // flight; it is never reused to identify a submission, so this value cannot
        // reintroduce or fix a correctness bug (DATA-1).
        private const val PENDING_EXPENSE_TTL_MS = 24 * 60 * 60 * 1000L
    }
}

/** Shared shape with web `SyncedPreferences` at users/{uid}/settings/preferences. */
data class SyncedPreferences(
    val currency: String,
    val locale: String,
    val themeMode: String,
    val onboardingComplete: Boolean,
    val dailyReminder: Boolean,
    val reminderHour: Int,
    val reminderMinute: Int,
    val analyticsPeriod: String,
    val monthlyBudget: Double?,
    val updatedAt: Long,
)
