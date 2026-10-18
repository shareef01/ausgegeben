package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the 2026-10-18 audit, mirroring web
 * backupFormat.integrity.test.ts: references, currency and optional preference fields
 * are refused before a restore performs any write.
 */
class BackupFormatIntegrityTest {

    private val categories = listOf(
        Category(id = "cat-food", name = "Food", iconName = "utensils", colorInt = 1, transactionType = "expense", sortOrder = 0),
        Category(id = "cat-pay", name = "Pay", iconName = "briefcase", colorInt = 2, transactionType = "income", sortOrder = 1),
    )
    private val expenses = listOf(
        Expense(id = "e1", amount = 12.5, dateMillis = 1_700_000_000_000L, categoryId = "cat-food", note = "", transactionType = "expense"),
    )

    private fun backup(schemaVersion: Int = 3): JSONObject = JSONObject(
        BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", null),
            categories = categories,
            expenses = expenses,
            appVersion = "2.1.3",
            schemaVersion = schemaVersion,
        )
    )

    private fun errorsOf(root: JSONObject): List<String> = BackupFormat.validateBackupJson(root.toString()).errors

    @Test
    fun rejectsMissingCategoryWhenBackupHasNoCategories() {
        for (version in 1..3) {
            val root = backup(version).put("categories", JSONArray())
            assertTrue(
                "v$version",
                errorsOf(root).contains("Expense at index 0 references nonexistent categoryId \"cat-food\""),
            )
        }
    }

    @Test
    fun uncategorizedSentinelMustBePresentButMayHoldAnyType() {
        val missing = backup()
        missing.getJSONArray("expenses").getJSONObject(0).put("categoryId", "0")
        assertTrue(errorsOf(missing).contains("Expense at index 0 references nonexistent categoryId \"0\""))

        val present = backup()
        present.getJSONArray("categories").put(
            JSONObject(mapOf("id" to "0", "name" to "Uncategorized", "iconName" to "help", "colorInt" to 0, "transactionType" to "expense", "sortOrder" to 9))
        )
        present.getJSONArray("expenses").getJSONObject(0).put("categoryId", "0").put("transactionType", "income")
        assertEquals(emptyList<String>(), errorsOf(present))
    }

    @Test
    fun acceptsEmptyBackup() {
        val root = backup(1).put("categories", JSONArray()).put("expenses", JSONArray())
        assertTrue(BackupFormat.validateBackupJson(root.toString()).valid)
    }

    @Test
    fun rejectsUnsupportedCurrencyInsteadOfRestoringEur() {
        for (currency in listOf("JPY", "eur", "XYZ")) {
            val root = backup()
            root.getJSONObject("preferences").put("currency", currency)
            assertTrue(currency, errorsOf(root).any { it.startsWith("preferences.currency") })
        }
        for (currency in BackupFormat.SUPPORTED_CURRENCIES) {
            val root = backup()
            root.getJSONObject("preferences").put("currency", currency)
            assertTrue(currency, BackupFormat.validateBackupJson(root.toString()).valid)
        }
    }

    @Test
    fun acceptsLegacyPreferencesWithoutOptionalFields() {
        val root = backup(1).put("preferences", JSONObject(mapOf("currency" to "GBP", "monthlyBudget" to 250)))
        assertTrue(BackupFormat.validateBackupJson(root.toString()).valid)
    }

    @Test
    fun rejectsMistypedOptionalPreferences() {
        val cases = listOf(
            "locale" to "fr",
            "locale" to 7,
            "themeMode" to 3,
            "preferencesUpdatedAt" to "1700000000000",
            "preferencesUpdatedAt" to -1,
            "preferencesUpdatedAt" to 1.5,
            "dailyReminder" to "yes",
            "reminderHour" to 24,
            "reminderMinute" to 60,
            "analyticsPeriod" to 42,
            "monthlyBudget" to 10.005,
        )
        for ((key, value) in cases) {
            val root = backup()
            root.getJSONObject("preferences").put(key, value)
            assertTrue("$key=$value", errorsOf(root).any { it.startsWith("preferences.$key") })
        }
    }

    @Test
    fun rejectsValuesTheRulesRefuseOrWebRejects() {
        val root = backup()
        root.getJSONArray("categories").getJSONObject(0).put("updatedAt", -5).put("sortOrder", 10000)
        root.getJSONArray("expenses").getJSONObject(0).put("amount", "12.50").put("note", 4)
        val errors = errorsOf(root)
        assertTrue(errors.contains("Category at index 0 updatedAt must be a non-negative integer timestamp"))
        assertTrue(errors.any { it.startsWith("Category at index 0 sortOrder") })
        assertTrue(errors.any { it.startsWith("Expense at index 0 has invalid amount") })
        assertTrue(errors.any { it.startsWith("Expense at index 0 note") })
    }

    @Test
    fun acceptsZeroCategoryUpdatedAtFromOlderExports() {
        val root = backup()
        root.getJSONArray("categories").getJSONObject(0).put("updatedAt", 0)
        assertTrue(BackupFormat.validateBackupJson(root.toString()).valid)
    }

    @Test
    fun restoreRevisionsStayInsideTheRulesClockWindow() {
        val now = 1_800_000_000_000L
        assertEquals(now, BackupFormat.restoredPreferencesRevision(null, now))
        assertEquals(now, BackupFormat.restoredPreferencesRevision(now - 10, now))
        assertEquals(now + 60_001, BackupFormat.restoredPreferencesRevision(now + 60_000, now))
        assertEquals(now + 240_000, BackupFormat.restoredPreferencesRevision(Long.MAX_VALUE / 2, now))
        assertEquals(now, BackupFormat.restoredCategoryRevision(null, now))
        assertEquals(now - 5, BackupFormat.restoredCategoryRevision(now - 5, now))
        assertEquals(now, BackupFormat.restoredCategoryRevision(now + 3_600_000, now))
        assertEquals(now + 240_000, BackupFormat.restoredPreferencesRevision(Long.MAX_VALUE, now))
    }
}
