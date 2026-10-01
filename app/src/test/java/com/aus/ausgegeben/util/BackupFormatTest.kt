package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupFormatTest {

    private val sampleCategories = listOf(
        Category(
            id = "cat-groceries",
            name = "Groceries",
            iconName = "shopping-cart",
            colorInt = -65536,
            transactionType = "expense",
            sortOrder = 1,
        ),
        Category(
            id = "cat-salary",
            name = "Salary",
            iconName = "briefcase",
            colorInt = -16711936,
            transactionType = "income",
            sortOrder = 2,
        ),
    )

    private val sampleExpenses = listOf(
        Expense(
            id = "exp-1",
            amount = 42.5,
            dateMillis = 1700000000000L,
            categoryId = "cat-groceries",
            note = "Supermarket",
            transactionType = "expense",
        ),
        Expense(
            id = "exp-2",
            amount = 2500.0,
            dateMillis = 1700000001000L,
            categoryId = "cat-salary",
            note = "Monthly salary",
            transactionType = "income",
        ),
        Expense(
            id = "exp-deleted",
            amount = 10.0,
            dateMillis = 1700000002000L,
            categoryId = "cat-groceries",
            note = "Deleted item",
            transactionType = "expense",
            deleted = true,
        ),
    )

    @Test
    fun createBackupJson_producesStandardValidBackup() {
        val prefs = BackupFormat.BackupPreferences(
            currency = "EUR",
            monthlyBudget = 1500.0,
            locale = "en",
            themeMode = "dark",
            preferencesUpdatedAt = 1700000000000L,
        )

        val json = BackupFormat.createBackupJson(
            preferences = prefs,
            categories = sampleCategories,
            expenses = sampleExpenses,
            appVersion = "2.0.8",
            exportedAt = "2026-10-01T00:00:00Z",
        )

        val root = JSONObject(json)
        assertEquals(BackupFormat.FORMAT_IDENTIFIER, root.getString("format"))
        assertEquals(BackupFormat.CURRENT_SCHEMA_VERSION, root.getInt("schemaVersion"))
        assertEquals("2.0.8", root.getString("appVersion"))
        assertEquals("2026-10-01T00:00:00Z", root.getString("exportedAt"))

        val categoriesArr = root.getJSONArray("categories")
        assertEquals(2, categoriesArr.length())

        val expensesArr = root.getJSONArray("expenses")
        // exp-deleted must be filtered out
        assertEquals(2, expensesArr.length())
        assertEquals("exp-1", expensesArr.getJSONObject(0).getString("id"))
        assertEquals("exp-2", expensesArr.getJSONObject(1).getString("id"))

        val validation = BackupFormat.validateBackupJson(json)
        assertTrue(validation.errors.joinToString(), validation.valid)
    }

    @Test
    fun createBackupJson_handlesNullAndNegativeBudget() {
        val prefs = BackupFormat.BackupPreferences(
            currency = "usd",
            monthlyBudget = null,
            locale = "de",
            themeMode = "system",
        )

        val json = BackupFormat.createBackupJson(
            preferences = prefs,
            categories = sampleCategories,
            expenses = sampleExpenses.take(1),
            appVersion = "2.0.8",
        )

        val root = JSONObject(json)
        val prefsObj = root.getJSONObject("preferences")
        assertEquals("USD", prefsObj.getString("currency"))
        assertTrue(prefsObj.isNull("monthlyBudget"))
        assertEquals("de", prefsObj.getString("locale"))
        assertEquals("system", prefsObj.getString("themeMode"))

        val validation = BackupFormat.validateBackupJson(json)
        assertTrue(validation.errors.joinToString(), validation.valid)
    }

    @Test
    fun createBackupJson_enforcesLengthBounds() {
        val longNameCategory = Category(
            id = "cat-long",
            name = "A".repeat(100),
            iconName = "B".repeat(100),
            colorInt = 123,
            transactionType = "expense",
            sortOrder = 0,
        )
        val longNoteExpense = Expense(
            id = "exp-long",
            amount = 12.3456,
            dateMillis = 1700000000000L,
            categoryId = "cat-long",
            note = "N".repeat(300),
            transactionType = "expense",
        )

        val json = BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", 50.0),
            categories = listOf(longNameCategory),
            expenses = listOf(longNoteExpense),
            appVersion = "2.0.8",
        )

        val root = JSONObject(json)
        val cat = root.getJSONArray("categories").getJSONObject(0)
        assertEquals(50, cat.getString("name").length)
        assertEquals(50, cat.getString("iconName").length)

        val exp = root.getJSONArray("expenses").getJSONObject(0)
        assertEquals(200, exp.getString("note").length)
        // 12.3456 must be rounded to 12.35
        assertEquals(12.35, exp.getDouble("amount"), 0.001)

        val validation = BackupFormat.validateBackupJson(json)
        assertTrue(validation.errors.joinToString(), validation.valid)
    }

    @Test
    fun validateBackupJson_rejectsUnknownTopLevelProperties() {
        val root = JSONObject()
        root.put("format", BackupFormat.FORMAT_IDENTIFIER)
        root.put("schemaVersion", 1)
        root.put("exportedAt", "2026-10-01T00:00:00Z")
        root.put("appVersion", "2.0.8")
        root.put("preferences", JSONObject())
        root.put("categories", org.json.JSONArray())
        root.put("expenses", org.json.JSONArray())
        root.put("unauthorizedProperty", "malicious_payload")

        val result = BackupFormat.validateBackupJson(root.toString())
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.contains("Unknown or prohibited top-level property") })
    }

    @Test
    fun validateBackupJson_rejectsSubCentPrecision() {
        val validJson = BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", 100.0),
            categories = sampleCategories,
            expenses = sampleExpenses.take(1),
            appVersion = "2.0.8",
        )
        val root = JSONObject(validJson)
        root.getJSONArray("expenses").getJSONObject(0).put("amount", 12.345)

        val result = BackupFormat.validateBackupJson(root.toString())
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.contains("sub-cent precision") })
    }

    @Test
    fun validateBackupJson_rejectsDuplicateIds() {
        val validJson = BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", 100.0),
            categories = listOf(sampleCategories[0], sampleCategories[0].copy(name = "Other")),
            expenses = listOf(sampleExpenses[0], sampleExpenses[0].copy(note = "Other")),
            appVersion = "2.0.8",
        )

        val result = BackupFormat.validateBackupJson(validJson)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.contains("Duplicate category id") })
        assertTrue(result.errors.any { it.contains("Duplicate expense id") })
    }

    @Test
    fun validateBackupJson_rejectsMissingCategoryReference() {
        val validJson = BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", 100.0),
            categories = sampleCategories,
            expenses = listOf(sampleExpenses[0].copy(categoryId = "nonexistent-category-id")),
            appVersion = "2.0.8",
        )

        val result = BackupFormat.validateBackupJson(validJson)
        assertFalse(result.valid)
        assertTrue(result.errors.any { it.contains("references nonexistent categoryId") })
    }
}
