package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.entity.CategoryBudget
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.math.roundToLong

object BackupFormat {
    const val FORMAT_IDENTIFIER = "ausgegeben-backup"
    const val CURRENT_SCHEMA_VERSION = 3

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
     * schemaVersion 2 and Web backupFormat.
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
        categoryBudgets: List<CategoryBudget> = emptyList(),
        recurring: RecurringBackupSection = RecurringBackupSection(emptyList(), emptyList()),
        schemaVersion: Int = CURRENT_SCHEMA_VERSION,
    ): String {
        val root = JSONObject()
        root.put("format", FORMAT_IDENTIFIER)
        root.put("schemaVersion", schemaVersion)
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
        if (schemaVersion >= 2) {
            root.put("categoryBudgets", JSONArray(categoryBudgets.map { JSONObject(it.payload() + ("categoryId" to it.categoryId)) }))
        }
        if (schemaVersion >= 3) {
            root.put("recurring", JSONObject(recurring.serialize()))
        }

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
            "expenses",
            "categoryBudgets",
            "recurring"
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

        if (root.opt("schemaVersion") !is Number || root.optDouble("schemaVersion") != root.optInt("schemaVersion").toDouble() || root.optInt("schemaVersion") !in setOf(1, 2, 3)) {
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

        val version = root.optInt("schemaVersion")
        if (version == 1) {
            if (root.has("categoryBudgets")) errors.add("Schema v1 cannot contain categoryBudgets")
            if (root.has("recurring")) errors.add("Schema v1 cannot contain recurring")
        }
        if (version == 2) {
            if (root.has("recurring")) errors.add("Schema v2 cannot contain recurring")
            val arr = root.optJSONArray("categoryBudgets")
            val seen = mutableSetOf<String>()
            val budgetCategories = categoriesArr?.let { cats -> (0 until cats.length()).mapNotNull { cats.optJSONObject(it) }.associateBy { it.optString("id") } } ?: emptyMap()
            if (arr == null) errors.add("categoryBudgets must be an array") else for (i in 0 until arr.length()) {
                val b = arr.optJSONObject(i)
                if (b == null) { errors.add("Invalid budget"); continue }
                val keys = b.keys().asSequence().toSet()
                val amount = b.optDouble("monthlyLimit", Double.NaN)
                val threshold = b.optDouble("warningThresholdPercent", Double.NaN)
                val updated = b.optDouble("updatedAt", Double.NaN)
                val budget = CategoryBudget(b.optString("categoryId"), amount, threshold.toInt(), updated.toLong())
                if (b.opt("categoryId") !is String || b.opt("monthlyLimit") !is Number || b.opt("warningThresholdPercent") !is Number || b.opt("updatedAt") !is Number || !budget.valid() || threshold != threshold.toInt().toDouble() || !updated.isFinite() || updated != updated.toLong().toDouble() || keys != setOf("categoryId","monthlyLimit","warningThresholdPercent","updatedAt")) errors.add("Invalid budget")
                if (!seen.add(budget.categoryId)) errors.add("Duplicate budget")
                val cat = budgetCategories[budget.categoryId]
                if (cat?.optString("transactionType") != "expense") errors.add("Budget requires expense category")
            }
        }
        if (version == 3) {
            val arr = root.optJSONArray("categoryBudgets")
            val seen = mutableSetOf<String>()
            val budgetCategories = categoriesArr?.let { cats -> (0 until cats.length()).mapNotNull { cats.optJSONObject(it) }.associateBy { it.optString("id") } } ?: emptyMap()
            if (arr == null) errors.add("categoryBudgets must be an array") else for (i in 0 until arr.length()) {
                val b = arr.optJSONObject(i)
                if (b == null) { errors.add("Invalid budget"); continue }
                val keys = b.keys().asSequence().toSet()
                val amount = b.optDouble("monthlyLimit", Double.NaN)
                val threshold = b.optDouble("warningThresholdPercent", Double.NaN)
                val updated = b.optDouble("updatedAt", Double.NaN)
                val budget = CategoryBudget(b.optString("categoryId"), amount, threshold.toInt(), updated.toLong())
                if (b.opt("categoryId") !is String || b.opt("monthlyLimit") !is Number || b.opt("warningThresholdPercent") !is Number || b.opt("updatedAt") !is Number || !budget.valid() || threshold != threshold.toInt().toDouble() || !updated.isFinite() || updated != updated.toLong().toDouble() || keys != setOf("categoryId","monthlyLimit","warningThresholdPercent","updatedAt")) errors.add("Invalid budget")
                if (!seen.add(budget.categoryId)) errors.add("Duplicate budget")
                val cat = budgetCategories[budget.categoryId]
                if (cat?.optString("transactionType") != "expense") errors.add("Budget requires expense category")
            }

            if (!root.has("recurring")) {
                errors.add("Schema v3 must contain recurring")
            } else {
                val recObj = root.optJSONObject("recurring")
                if (recObj == null) {
                    errors.add("recurring must be a JSON object")
                } else {
                    try {
                        val sec = RecurringBackupSection.parse(recObj.toString())
                        for (t in sec.templates) {
                            val cat = budgetCategories[t.categoryId]
                            if (cat == null) {
                                errors.add("Recurring template \"${t.id}\" references nonexistent category \"${t.categoryId}\"")
                            } else if (cat.optString("transactionType") != t.transactionType) {
                                errors.add("Recurring template \"${t.id}\" type \"${t.transactionType}\" does not match category type \"${cat.optString("transactionType")}\"")
                            }
                        }
                    } catch (e: Exception) {
                        errors.add("Invalid recurring section: ${e.message}")
                    }
                }
            }
        }

        return ValidationResult(valid = errors.isEmpty(), errors = errors)
    }

    data class BackupSummary(
        val schemaVersion: Int,
        val appVersion: String,
        val exportedAt: String,
        val expenseCount: Int,
        val categoryCount: Int,
        val currency: String,
        val monthlyBudget: Double?,
    )

    data class ParsedCategory(
        val id: String,
        val name: String,
        val iconName: String,
        val colorInt: Int,
        val transactionType: String,
        val sortOrder: Int,
        val updatedAt: Long? = null,
    )

    data class ParsedExpense(
        val id: String,
        val amount: Double,
        val dateMillis: Long,
        val categoryId: String,
        val note: String,
        val transactionType: String,
        val updatedAt: Long? = null,
    )

    data class ParsedBackup(
        val schemaVersion: Int,
        val appVersion: String,
        val exportedAt: String,
        val preferences: BackupPreferences,
        val categories: List<ParsedCategory>,
        val expenses: List<ParsedExpense>,
        val categoryBudgets: List<CategoryBudget> = emptyList(),
        val recurring: RecurringBackupSection? = null,
    )

    fun parseBackup(jsonString: String): ParsedBackup? {
        val validation = validateBackupJson(jsonString)
        if (!validation.valid) return null

        val root = try {
            JSONObject(jsonString)
        } catch (_: Exception) {
            return null
        }

        val schemaVersion = root.optInt("schemaVersion", CURRENT_SCHEMA_VERSION)
        val appVersion = root.optString("appVersion", "")
        val exportedAt = root.optString("exportedAt", "")

        val prefsObj = root.optJSONObject("preferences") ?: JSONObject()
        val budget = if (prefsObj.has("monthlyBudget") && !prefsObj.isNull("monthlyBudget")) {
            prefsObj.optDouble("monthlyBudget").takeIf { it > 0.0 }
        } else null
        val prefs = BackupPreferences(
            currency = prefsObj.optString("currency", "EUR"),
            monthlyBudget = budget,
            locale = prefsObj.optString("locale", "en"),
            themeMode = prefsObj.optString("themeMode", "system"),
            preferencesUpdatedAt = if (prefsObj.has("preferencesUpdatedAt")) prefsObj.optLong("preferencesUpdatedAt") else null,
        )

        val categories = mutableListOf<ParsedCategory>()
        val categoriesArr = root.optJSONArray("categories")
        if (categoriesArr != null) {
            for (i in 0 until categoriesArr.length()) {
                val cat = categoriesArr.optJSONObject(i) ?: continue
                categories.add(
                    ParsedCategory(
                        id = cat.optString("id"),
                        name = cat.optString("name"),
                        iconName = cat.optString("iconName"),
                        colorInt = cat.optInt("colorInt"),
                        transactionType = cat.optString("transactionType"),
                        sortOrder = cat.optInt("sortOrder"),
                        updatedAt = if (cat.has("updatedAt")) cat.optLong("updatedAt") else null,
                    )
                )
            }
        }

        val expenses = mutableListOf<ParsedExpense>()
        val expensesArr = root.optJSONArray("expenses")
        if (expensesArr != null) {
            for (i in 0 until expensesArr.length()) {
                val exp = expensesArr.optJSONObject(i) ?: continue
                expenses.add(
                    ParsedExpense(
                        id = exp.optString("id"),
                        amount = exp.optDouble("amount"),
                        dateMillis = exp.optLong("dateMillis"),
                        categoryId = exp.optString("categoryId"),
                        note = exp.optString("note"),
                        transactionType = exp.optString("transactionType"),
                        updatedAt = if (exp.has("updatedAt")) exp.optLong("updatedAt") else null,
                    )
                )
            }
        }

        val recurringSection = if (root.has("recurring")) {
            try {
                root.optJSONObject("recurring")?.let { RecurringBackupSection.parse(it.toString()) }
            } catch (_: Exception) { null }
        } else null

        return ParsedBackup(
            categoryBudgets = root.optJSONArray("categoryBudgets")?.let { arr -> (0 until arr.length()).map { i -> val b = arr.getJSONObject(i); CategoryBudget(b.getString("categoryId"), b.getDouble("monthlyLimit"), b.getInt("warningThresholdPercent"), b.getLong("updatedAt")) } } ?: emptyList(),
            recurring = recurringSection,
            schemaVersion = schemaVersion,
            appVersion = appVersion,
            exportedAt = exportedAt,
            preferences = prefs,
            categories = categories,
            expenses = expenses,
        )
    }

    fun parseBackupSummary(jsonString: String): BackupSummary? {
        val parsed = parseBackup(jsonString) ?: return null
        return BackupSummary(
            schemaVersion = parsed.schemaVersion,
            appVersion = parsed.appVersion,
            exportedAt = parsed.exportedAt,
            expenseCount = parsed.expenses.size,
            categoryCount = parsed.categories.size,
            currency = parsed.preferences.currency,
            monthlyBudget = parsed.preferences.monthlyBudget,
        )
    }
}
