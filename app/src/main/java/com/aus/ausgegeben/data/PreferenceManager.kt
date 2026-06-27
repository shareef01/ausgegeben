package com.aus.ausgegeben.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.sync.SyncedPreferences
import java.util.Locale

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
        val PREFERENCES_UPDATED_AT = stringPreferencesKey("preferences_updated_at")
        val LAST_CLOUD_SYNC_AT = stringPreferencesKey("last_cloud_sync_at")
    }

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

    val preferencesUpdatedAtFlow: Flow<Long> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { prefs ->
            prefs[PreferencesKeys.PREFERENCES_UPDATED_AT]?.toLongOrNull() ?: 0L
        }

    val lastCloudSyncAtFlow: Flow<Long?> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { prefs ->
            prefs[PreferencesKeys.LAST_CLOUD_SYNC_AT]?.toLongOrNull()
        }

    suspend fun reminderTime(): Pair<Int, Int> {
        val prefs = context.dataStore.data.first()
        return (prefs[PreferencesKeys.REMINDER_HOUR] ?: 19) to (prefs[PreferencesKeys.REMINDER_MINUTE] ?: 0)
    }

    suspend fun updateCurrency(currency: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.CURRENCY] = currency
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun updateDarkMode(isDarkMode: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.DARK_MODE] = isDarkMode
            preferences[PreferencesKeys.THEME_MODE] = if (isDarkMode) ThemeMode.DARK.storageKey else ThemeMode.LIGHT.storageKey
        }
    }

    suspend fun updateThemeMode(mode: ThemeMode) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.THEME_MODE] = mode.storageKey
            when (mode) {
                ThemeMode.LIGHT, ThemeMode.SOFT_LIGHT ->
                    preferences[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN ->
                    preferences[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun setOnboardingComplete() {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] = true
        }
    }

    suspend fun updateDailyReminder(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.DAILY_REMINDER] = enabled
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun updateReminderTime(hour: Int, minute: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.REMINDER_HOUR] = hour.coerceIn(0, 23)
            preferences[PreferencesKeys.REMINDER_MINUTE] = minute.coerceIn(0, 59)
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun updateAnalyticsPeriod(period: AnalyticsPeriod) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.ANALYTICS_PERIOD] = period.storageKey
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun updateMonthlyBudget(amount: Double?) {
        context.dataStore.edit { preferences ->
            if (amount == null || amount <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences[PreferencesKeys.MONTHLY_BUDGET] = amount.toString()
            }
            bumpPreferencesUpdatedAt(preferences)
        }
    }

    suspend fun toSyncedPreferences(): SyncedPreferences {
        val prefs = context.dataStore.data.first()
        val localeTag = Locale.getDefault().language
        val locale = if (localeTag == "de") "de" else "en"
        return SyncedPreferences(
            currency = prefs[PreferencesKeys.CURRENCY] ?: "EUR",
            locale = locale,
            themeMode = prefs[PreferencesKeys.THEME_MODE]
                ?: ThemeMode.SYSTEM.storageKey,
            dailyReminder = prefs[PreferencesKeys.DAILY_REMINDER] ?: true,
            reminderHour = prefs[PreferencesKeys.REMINDER_HOUR] ?: 19,
            reminderMinute = prefs[PreferencesKeys.REMINDER_MINUTE] ?: 0,
            analyticsPeriod = prefs[PreferencesKeys.ANALYTICS_PERIOD]
                ?: AnalyticsPeriod.THIS_MONTH.storageKey,
            monthlyBudget = prefs[PreferencesKeys.MONTHLY_BUDGET]?.toDoubleOrNull()?.takeIf { it > 0 },
            updatedAt = prefs[PreferencesKeys.PREFERENCES_UPDATED_AT]?.toLongOrNull()
                ?: System.currentTimeMillis(),
        )
    }

    suspend fun applySyncedPreferences(prefs: SyncedPreferences) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.CURRENCY] = prefs.currency
            preferences[PreferencesKeys.THEME_MODE] = prefs.themeMode
            preferences[PreferencesKeys.DAILY_REMINDER] = prefs.dailyReminder
            preferences[PreferencesKeys.REMINDER_HOUR] = prefs.reminderHour
            preferences[PreferencesKeys.REMINDER_MINUTE] = prefs.reminderMinute
            preferences[PreferencesKeys.ANALYTICS_PERIOD] = prefs.analyticsPeriod
            if (prefs.monthlyBudget == null || prefs.monthlyBudget <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences[PreferencesKeys.MONTHLY_BUDGET] = prefs.monthlyBudget.toString()
            }
            preferences[PreferencesKeys.PREFERENCES_UPDATED_AT] = prefs.updatedAt.toString()
            when (prefs.themeModeEnum()) {
                ThemeMode.LIGHT, ThemeMode.SOFT_LIGHT ->
                    preferences[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN ->
                    preferences[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
        }
    }

    suspend fun setLastCloudSyncAt(timestamp: Long) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.LAST_CLOUD_SYNC_AT] = timestamp.toString()
        }
    }

    private fun bumpPreferencesUpdatedAt(preferences: androidx.datastore.preferences.core.MutablePreferences) {
        preferences[PreferencesKeys.PREFERENCES_UPDATED_AT] = System.currentTimeMillis().toString()
    }
}
