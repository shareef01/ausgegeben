package com.aus.ausgegeben.data

import com.aus.ausgegeben.ui.theme.ThemeMode

/** User settings synced to Firestore (device-local flags excluded). */
data class SyncedPreferences(
    val currency: String,
    val locale: String,
    val themeMode: ThemeMode,
    val dailyReminder: Boolean,
    val reminderHour: Int,
    val reminderMinute: Int,
    val analyticsPeriod: String,
    val recordListPeriod: String,
    val monthlyBudget: Double?,
    val updatedAt: Long,
)
