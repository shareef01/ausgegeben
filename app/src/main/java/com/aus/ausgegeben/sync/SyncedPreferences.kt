package com.aus.ausgegeben.sync

import com.aus.ausgegeben.ui.theme.ThemeMode

/** Preferences synced to Firestore (matches PWA `SyncedPreferences`). */
data class SyncedPreferences(
    val currency: String,
    val locale: String,
    val themeMode: String,
    val dailyReminder: Boolean,
    val reminderHour: Int,
    val reminderMinute: Int,
    val analyticsPeriod: String,
    val monthlyBudget: Double?,
    val updatedAt: Long,
) {
    fun themeModeEnum(): ThemeMode = ThemeMode.fromStorageKey(themeMode)
}
