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

    suspend fun reminderTime(): Pair<Int, Int> {
        val prefs = context.dataStore.data.first()
        return (prefs[PreferencesKeys.REMINDER_HOUR] ?: 19) to (prefs[PreferencesKeys.REMINDER_MINUTE] ?: 0)
    }

    suspend fun updateCurrency(currency: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.CURRENCY] = currency
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
                ThemeMode.LIGHT, ThemeMode.LAVENDER, ThemeMode.SOFT_LIGHT ->
                    preferences[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN, ThemeMode.FOREST, ThemeMode.SUNSET ->
                    preferences[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
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
        }
    }

    suspend fun updateReminderTime(hour: Int, minute: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.REMINDER_HOUR] = hour.coerceIn(0, 23)
            preferences[PreferencesKeys.REMINDER_MINUTE] = minute.coerceIn(0, 59)
        }
    }

    suspend fun updateAnalyticsPeriod(period: AnalyticsPeriod) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.ANALYTICS_PERIOD] = period.storageKey
        }
    }

    suspend fun updateMonthlyBudget(amount: Double?) {
        context.dataStore.edit { preferences ->
            if (amount == null || amount <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences[PreferencesKeys.MONTHLY_BUDGET] = amount.toString()
            }
        }
    }
}
