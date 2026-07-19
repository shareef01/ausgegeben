package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PreferencesCloudSyncTest {

    private fun validRaw(overrides: Map<String, Any?> = emptyMap()): Map<String, Any> {
        val base = mutableMapOf<String, Any?>(
            "currency" to "USD",
            "locale" to "en",
            "themeMode" to "dark",
            "onboardingComplete" to true,
            "dailyReminder" to true,
            "reminderHour" to 9,
            "reminderMinute" to 30,
            "analyticsPeriod" to "this_month",
            "monthlyBudget" to 500.0,
            "updatedAt" to 123456789L,
        )
        base.putAll(overrides)
        @Suppress("UNCHECKED_CAST")
        return base.filterValues { it != null } as Map<String, Any>
    }

    @Test
    fun parseRemote_returnsNull_whenRawIsNull() {
        assertNull(PreferencesCloudSync.parseRemote(null))
    }

    @Test
    fun parseRemote_returnsNull_whenLocaleMissing() {
        val raw = validRaw().minus("locale")
        assertNull(PreferencesCloudSync.parseRemote(raw))
    }

    @Test
    fun parseRemote_returnsNull_whenLocaleInvalid() {
        val raw = validRaw(mapOf("locale" to "fr"))
        assertNull(PreferencesCloudSync.parseRemote(raw))
    }

    @Test
    fun parseRemote_returnsNull_whenThemeModeMissing() {
        val raw = validRaw().minus("themeMode")
        assertNull(PreferencesCloudSync.parseRemote(raw))
    }

    @Test
    fun parseRemote_returnsNull_whenThemeModeInvalid() {
        val raw = validRaw(mapOf("themeMode" to "neon"))
        assertNull(PreferencesCloudSync.parseRemote(raw))
    }

    @Test
    fun parseRemote_defaultsOnboardingComplete_toTrue_whenFieldAbsent() {
        val raw = validRaw().minus("onboardingComplete")
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertTrue(result.onboardingComplete)
    }

    @Test
    fun parseRemote_readsOnboardingComplete_whenTrue() {
        val raw = validRaw(mapOf("onboardingComplete" to true))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertTrue(result.onboardingComplete)
    }

    @Test
    fun parseRemote_readsOnboardingComplete_whenFalse() {
        val raw = validRaw(mapOf("onboardingComplete" to false))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertFalse(result.onboardingComplete)
    }

    @Test
    fun parseRemote_clampsReminderHour_whenAboveRange() {
        val raw = validRaw(mapOf("reminderHour" to 42))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals(23, result.reminderHour)
    }

    @Test
    fun parseRemote_clampsReminderHour_whenBelowRange() {
        val raw = validRaw(mapOf("reminderHour" to -5))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals(0, result.reminderHour)
    }

    @Test
    fun parseRemote_clampsReminderMinute_whenAboveRange() {
        val raw = validRaw(mapOf("reminderMinute" to 90))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals(59, result.reminderMinute)
    }

    @Test
    fun parseRemote_clampsReminderMinute_whenBelowRange() {
        val raw = validRaw(mapOf("reminderMinute" to -1))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals(0, result.reminderMinute)
    }

    @Test
    fun parseRemote_defaultsMonthlyBudget_toNull_whenAbsent() {
        val raw = validRaw().minus("monthlyBudget")
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertNull(result.monthlyBudget)
    }

    @Test
    fun parseRemote_defaultsMonthlyBudget_toNull_whenNonPositive() {
        val raw = validRaw(mapOf("monthlyBudget" to 0.0))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertNull(result.monthlyBudget)

        val negativeRaw = validRaw(mapOf("monthlyBudget" to -10.0))
        val negativeResult = PreferencesCloudSync.parseRemote(negativeRaw)
        requireNotNull(negativeResult)
        assertNull(negativeResult.monthlyBudget)
    }

    @Test
    fun parseRemote_keepsMonthlyBudget_whenPositive() {
        val raw = validRaw(mapOf("monthlyBudget" to 250.0))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals(250.0, result.monthlyBudget!!, 0.001)
    }

    @Test
    fun parseRemote_defaultsCurrency_toEur_whenMissing() {
        val raw = validRaw().minus("currency")
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals("EUR", result.currency)
    }

    @Test
    fun parseRemote_defaultsCurrency_toEur_whenBlank() {
        val raw = validRaw(mapOf("currency" to "   "))
        val result = PreferencesCloudSync.parseRemote(raw)
        requireNotNull(result)
        assertEquals("EUR", result.currency)
    }
}
