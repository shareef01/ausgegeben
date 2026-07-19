package com.aus.ausgegeben.data

import android.content.Context
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

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class PreferenceManager(private val context: Context) {

    private object PreferencesKeys {
        val CURRENCY = stringPreferencesKey("currency")
        val DARK_MODE = booleanPreferencesKey("dark_mode")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
        val DAILY_REMINDER = booleanPreferencesKey("daily_reminder")
        val REMINDER_HOUR = intPreferencesKey("reminder_hour")
        val REMINDER_MINUTE = intPreferencesKey("reminder_minute")
        val ANALYTICS_PERIOD = stringPreferencesKey("analytics_period")
        val MONTHLY_BUDGET = stringPreferencesKey("monthly_budget")
        val STORAGE_MODE = stringPreferencesKey("storage_mode")
        val AUTH_GATEWAY_COMPLETE = booleanPreferencesKey("auth_gateway_complete")
        val LAST_CLOUD_SYNC_AT = stringPreferencesKey("last_cloud_sync_at")
        val LANGUAGE = stringPreferencesKey("language")
        /** LWW clock shared with web (`users/{uid}/settings/preferences.updatedAt`). */
        val PREFERENCES_UPDATED_AT = stringPreferencesKey("preferences_updated_at")
    }

    val languageFlow: Flow<String> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { it[PreferencesKeys.LANGUAGE] ?: "en" }

    val currencyFlow: Flow<String> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.CURRENCY] ?: "EUR"
        }

    val darkModeFlow: Flow<Boolean?> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.DARK_MODE]
        }

    val themeModeFlow: Flow<ThemeMode> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[PreferencesKeys.THEME_MODE]?.let { ThemeMode.fromStorageKey(it) }
                ?: when (preferences[PreferencesKeys.DARK_MODE]) {
                    false -> ThemeMode.LIGHT
                    true -> ThemeMode.DARK
                    null -> ThemeMode.SYSTEM
                }
        }

    val onboardingCompleteFlow: Flow<Boolean> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] ?: false
        }

    val dailyReminderFlow: Flow<Boolean> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.DAILY_REMINDER] ?: true
        }

    suspend fun isDailyReminderEnabled(): Boolean = dailyReminderFlow.first()

    val reminderHourFlow: Flow<Int> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { it[PreferencesKeys.REMINDER_HOUR] ?: 19 }

    val reminderMinuteFlow: Flow<Int> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { it[PreferencesKeys.REMINDER_MINUTE] ?: 0 }

    val analyticsPeriodFlow: Flow<String> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { it[PreferencesKeys.ANALYTICS_PERIOD] ?: AnalyticsPeriod.THIS_MONTH.storageKey }

    val monthlyBudgetFlow: Flow<Double?> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { prefs ->
            prefs[PreferencesKeys.MONTHLY_BUDGET]?.toDoubleOrNull()?.takeIf { it > 0 }
        }

    val storageModeFlow: Flow<StorageMode> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            StorageMode.fromStorageKey(preferences[PreferencesKeys.STORAGE_MODE])
        }

    val authGatewayCompleteFlow: Flow<Boolean> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[PreferencesKeys.AUTH_GATEWAY_COMPLETE] ?: false
        }

    val lastCloudSyncAtFlow: Flow<Long?> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[PreferencesKeys.LAST_CLOUD_SYNC_AT]?.toLongOrNull()
        }

    val preferencesUpdatedAtFlow: Flow<Long> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences ->
            preferences[PreferencesKeys.PREFERENCES_UPDATED_AT]?.toLongOrNull() ?: 0L
        }
        .distinctUntilChanged()

    suspend fun preferencesUpdatedAt(): Long = preferencesUpdatedAtFlow.first()

    suspend fun reminderTime(): Pair<Int, Int> {
        val prefs = context.dataStore.data.first()
        return (prefs[PreferencesKeys.REMINDER_HOUR] ?: 19) to (prefs[PreferencesKeys.REMINDER_MINUTE] ?: 0)
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
            currency = prefs[PreferencesKeys.CURRENCY] ?: "EUR",
            locale = prefs[PreferencesKeys.LANGUAGE] ?: "en",
            themeMode = theme.storageKey,
            onboardingComplete = prefs[PreferencesKeys.ONBOARDING_COMPLETE] ?: false,
            dailyReminder = prefs[PreferencesKeys.DAILY_REMINDER] ?: true,
            reminderHour = prefs[PreferencesKeys.REMINDER_HOUR] ?: 19,
            reminderMinute = prefs[PreferencesKeys.REMINDER_MINUTE] ?: 0,
            analyticsPeriod = prefs[PreferencesKeys.ANALYTICS_PERIOD] ?: AnalyticsPeriod.THIS_MONTH.storageKey,
            monthlyBudget = prefs[PreferencesKeys.MONTHLY_BUDGET]?.toDoubleOrNull()?.takeIf { it > 0 },
            updatedAt = prefs[PreferencesKeys.PREFERENCES_UPDATED_AT]?.toLongOrNull() ?: 0L,
        )
    }

    /** Apply cloud prefs without bumping updatedAt (uses remote clock). */
    suspend fun applySyncedPreferences(remote: SyncedPreferences) {
        val mode = ThemeMode.fromStorageKey(remote.themeMode)
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.CURRENCY] = remote.currency
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
                preferences[PreferencesKeys.ONBOARDING_COMPLETE] = true
            }
            preferences[PreferencesKeys.DAILY_REMINDER] = remote.dailyReminder
            preferences[PreferencesKeys.REMINDER_HOUR] = remote.reminderHour.coerceIn(0, 23)
            preferences[PreferencesKeys.REMINDER_MINUTE] = remote.reminderMinute.coerceIn(0, 59)
            preferences[PreferencesKeys.ANALYTICS_PERIOD] = remote.analyticsPeriod
            if (remote.monthlyBudget == null || remote.monthlyBudget <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences[PreferencesKeys.MONTHLY_BUDGET] = remote.monthlyBudget.toString()
            }
            preferences[PreferencesKeys.PREFERENCES_UPDATED_AT] = remote.updatedAt.toString()
        }
    }

    private suspend fun touchEdit(block: MutablePreferences.() -> Unit) {
        val now = System.currentTimeMillis().toString()
        context.dataStore.edit { preferences ->
            preferences.block()
            preferences[PreferencesKeys.PREFERENCES_UPDATED_AT] = now
        }
    }

    suspend fun updateCurrency(currency: String) {
        touchEdit { this[PreferencesKeys.CURRENCY] = currency }
    }

    suspend fun updateDarkMode(isDarkMode: Boolean) {
        touchEdit {
            this[PreferencesKeys.DARK_MODE] = isDarkMode
            this[PreferencesKeys.THEME_MODE] =
                if (isDarkMode) ThemeMode.DARK.storageKey else ThemeMode.LIGHT.storageKey
        }
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
        touchEdit { this[PreferencesKeys.ONBOARDING_COMPLETE] = true }
    }

    suspend fun updateDailyReminder(enabled: Boolean) {
        touchEdit { this[PreferencesKeys.DAILY_REMINDER] = enabled }
    }

    suspend fun updateReminderTime(hour: Int, minute: Int) {
        touchEdit {
            this[PreferencesKeys.REMINDER_HOUR] = hour.coerceIn(0, 23)
            this[PreferencesKeys.REMINDER_MINUTE] = minute.coerceIn(0, 59)
        }
    }

    suspend fun updateAnalyticsPeriod(period: AnalyticsPeriod) {
        updateAnalyticsPeriodKey(period.storageKey)
    }

    suspend fun updateAnalyticsPeriodKey(storageKey: String) {
        touchEdit { this[PreferencesKeys.ANALYTICS_PERIOD] = storageKey }
    }

    suspend fun updateMonthlyBudget(amount: Double?) {
        touchEdit {
            if (amount == null || amount <= 0) {
                remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                this[PreferencesKeys.MONTHLY_BUDGET] = amount.toString()
            }
        }
    }

    suspend fun setStorageMode(mode: StorageMode) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.STORAGE_MODE] = mode.storageKey
        }
    }

    suspend fun setAuthGatewayComplete() {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.AUTH_GATEWAY_COMPLETE] = true
        }
    }

    suspend fun resetAuthGateway() {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.AUTH_GATEWAY_COMPLETE] = false
        }
    }

    suspend fun setLastCloudSyncAt(millis: Long) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.LAST_CLOUD_SYNC_AT] = millis.toString()
        }
    }

    suspend fun clearSyncTimestamp() {
        context.dataStore.edit { preferences ->
            preferences.remove(PreferencesKeys.LAST_CLOUD_SYNC_AT)
        }
    }

    suspend fun updateLanguage(languageCode: String) {
        touchEdit { this[PreferencesKeys.LANGUAGE] = languageCode }
    }

    /** Ensure local LWW clock is non-zero before first cloud seed. */
    suspend fun ensurePreferencesTimestamp(): Long {
        val current = preferencesUpdatedAt()
        if (current > 0L) return current
        val now = System.currentTimeMillis()
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.PREFERENCES_UPDATED_AT] = now.toString()
        }
        return now
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
