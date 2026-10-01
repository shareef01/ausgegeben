package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.math.roundToLong

object BackupFormat {
    const val FORMAT_IDENTIFIER = "ausgegeben-backup"
    const val CURRENT_SCHEMA_VERSION = 1

    private val ALLOWED_TRANSACTION_TYPES = setOf("expense", "income", "transfer")

    data class BackupPreferences(
        val currency: String,
        val monthlyBudget: Double?,
        val locale: String = "en",
        val themeMode: String = "system",
        val preferencesUpdatedAt: Long? = null,
    )

    data class ValidationResult(
        val valid: Boolean,
        val errors: List<String> = emptyList(),
    )

    /**
     * Serializes account state into a standardized, versioned JSON backup matching
     * schemaVersion 1 and Web backupFormat.
     *
     * Guaranteed to omit authentication credentials, Firebase tokens, encryption keys,
     * submission journals, and local transient state.
     */
    fun createBackupJson(
        preferences: BackupPreferences,
        categories: List<Category>,
        expenses: List<Expense>,
        appVersion: String,
        exportedAt: String = Instant.now().toString(),
    ): String {
        val root = JSONObject()
        root.put("format", FORMAT_IDENTIFIER)
        root.put("schemaVersion", CURRENT_SCHEMA_VERSION)
        root.put("exportedAt", exportedAt)
        root.put("appVersion", appVersion.ifBlank { "unknown" })

        val prefsObj = JSONObject()
        prefsObj.put("currency", preferences.currency.uppercase().take(3))
        if (preferences.monthlyBudget != null && preferences.monthlyBudget > 0.0 && preferences.monthlyBudget < 1_000_000_000.0) {
            val roundedBudget = (preferences.monthlyBudget * 100.0).roundToLong() / 100.0
            prefsObj.put("monthlyBudget", roundedBudget)
        } else {
            prefsObj.put("monthlyBudget", JSONObject.NULL)
        }
        prefsObj.put("locale", if (preferences.locale == "de") "de" else "en")
        prefsObj.put("themeMode", preferences.themeMode.ifBlank { "system" })
        preferences.preferencesUpdatedAt?.takeIf { it > 0 }?.let {
            prefsObj.put("preferencesUpdatedAt", it)
        }
        root.put("preferences", prefsObj)

        val categoriesArr = JSONArray()
        for (c in categories) {
            val catObj = JSONObject()
            catObj.put("id", c.id)
            catObj.put("name", c.name.trim().take(50))
            catObj.put("iconName", c.iconName.take(50))
            catObj.put("colorInt", c.colorInt)
            val type = if (c.transactionType in ALLOWED_TRANSACTION_TYPES) c.transactionType else "expense"
            catObj.put("transactionType", type)
            catObj.put("sortOrder", c.sortOrder)
            categoriesArr.put(catObj)
        }
        root.put("categories", categoriesArr)

        val expensesArr = JSONArray()
        for (e in expenses) {
            if (e.deleted) continue
            val expObj = JSONObject()
            expObj.put("id", e.id)
            val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
            expObj.put("amount", roundedAmount)
            expObj.put("dateMillis", e.dateMillis)
            expObj.put("categoryId", e.categoryId)
            expObj.put("note", e.note.take(200))
            val type = if (e.transactionType in ALLOWED_TRANSACTION_TYPES) e.transactionType else "expense"
            expObj.put("transactionType", type)
            expensesArr.put(expObj)
        }
        root.put("expenses", expensesArr)

        return root.toString(2)
    }

    /**
     * Validates an exported backup JSON string against schemaVersion 1 rules.
     */
    fun validateBackupJson(jsonString: String): ValidationResult {
        val errors = mutableListOf<String>()
        val root = try {
            JSONObject(jsonString)
        } catch (e: Exception) {
            return ValidationResult(valid = false, errors = listOf("Invalid JSON: ${e.message}"))
        }

        val allowedKeys = setOf(
            "format",
            "schemaVersion",
            "exportedAt",
            "appVersion",
            "preferences",
            "categories",
            "expenses"
        )
        val keys = root.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key !in allowedKeys) {
                errors.add("Unknown or prohibited top-level property: \"$key\"")
            }
        }

        if (root.optString("format") != FORMAT_IDENTIFIER) {
            errors.add("Invalid format identifier: expected \"$FORMAT_IDENTIFIER\"")
        }

        if (root.optInt("schemaVersion") != CURRENT_SCHEMA_VERSION) {
            errors.add("Unsupported schema version: expected $CURRENT_SCHEMA_VERSION")
        }

        if (root.optString("exportedAt").isBlank()) {
            errors.add("exportedAt must be a non-empty string")
        }

        if (root.optString("appVersion").isBlank()) {
            errors.add("appVersion must be a non-empty string")
        }

        val prefs = root.optJSONObject("preferences")
        if (prefs == null) {
            errors.add("preferences must be a JSON object")
        } else {
            val cur = prefs.optString("currency")
            if (cur.length != 3) {
                errors.add("preferences.currency must be a 3-character currency code")
            }
            if (prefs.has("monthlyBudget") && !prefs.isNull("monthlyBudget")) {
                val budget = prefs.optDouble("monthlyBudget", -1.0)
                if (budget <= 0.0 || budget >= 1_000_000_000.0) {
                    errors.add("preferences.monthlyBudget must be null or positive number < 1,000,000,000")
                }
            }
        }

        val categoriesArr = root.optJSONArray("categories")
        val categoryIds = mutableSetOf<String>()
        if (categoriesArr == null) {
            errors.add("categories must be an array")
        } else {
            for (i in 0 until categoriesArr.length()) {
                val cat = categoriesArr.optJSONObject(i)
                if (cat == null) {
                    errors.add("Category at index $i must be a JSON object")
                    continue
                }
                val id = cat.optString("id")
                if (id.isBlank()) {
                    errors.add("Category at index $i has missing id")
                } else if (!categoryIds.add(id)) {
                    errors.add("Duplicate category id: \"$id\"")
                }
                val name = cat.optString("name")
                if (name.isBlank() || name.length > 50) {
                    errors.add("Category at index $i name must be between 1 and 50 characters")
                }
                val type = cat.optString("transactionType")
                if (type !in ALLOWED_TRANSACTION_TYPES) {
                    errors.add("Category at index $i has invalid transactionType: \"$type\"")
                }
            }
        }

        val expensesArr = root.optJSONArray("expenses")
        val expenseIds = mutableSetOf<String>()
        if (expensesArr == null) {
            errors.add("expenses must be an array")
        } else {
            for (i in 0 until expensesArr.length()) {
                val exp = expensesArr.optJSONObject(i)
                if (exp == null) {
                    errors.add("Expense at index $i must be a JSON object")
                    continue
                }
                val id = exp.optString("id")
                if (id.isBlank()) {
                    errors.add("Expense at index $i has missing id")
                } else if (!expenseIds.add(id)) {
                    errors.add("Duplicate expense id: \"$id\"")
                }
                val amount = exp.optDouble("amount", -1.0)
                if (amount <= 0.0 || amount >= 1_000_000_000.0) {
                    errors.add("Expense at index $i has invalid amount: must be positive < 1,000,000,000")
                }
                val inCents = amount * 100.0
                if (kotlin.math.abs(inCents - inCents.roundToLong()) > 1e-4) {
                    errors.add("Expense at index $i has sub-cent precision: $amount")
                }
                val dateMillis = exp.optLong("dateMillis", -1L)
                if (dateMillis <= 0L) {
                    errors.add("Expense at index $i has invalid dateMillis")
                }
                val catId = exp.optString("categoryId")
                if (catId.isBlank()) {
                    errors.add("Expense at index $i has missing categoryId")
                } else if (categoryIds.isNotEmpty() && catId !in categoryIds) {
                    errors.add("Expense at index $i references nonexistent categoryId \"$catId\"")
                }
                val note = exp.optString("note")
                if (note.length > 200) {
                    errors.add("Expense at index $i note must be at most 200 characters")
                }
                val type = exp.optString("transactionType")
                if (type !in ALLOWED_TRANSACTION_TYPES) {
                    errors.add("Expense at index $i has invalid transactionType: \"$type\"")
                }
            }
        }

        return ValidationResult(valid = errors.isEmpty(), errors = errors)
    }
}
