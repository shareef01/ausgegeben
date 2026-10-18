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
    val SUPPORTED_CURRENCIES = setOf("EUR", "USD", "GBP", "CHF")
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0

    /** A JSON number with no fractional part inside JavaScript's safe range, else null. */
    private fun JSONObject.integralOrNull(key: String): Long? {
        val d = (opt(key) as? Number)?.toDouble() ?: return null
        return if (d.isFinite() && d == kotlin.math.floor(d) && kotlin.math.abs(d) <= MAX_SAFE_INTEGER) d.toLong() else null
    }

    private fun isCentGranular(value: Double): Boolean {
        val inCents = value * 100.0
        return kotlin.math.abs(inCents - inCents.roundToLong()) <= 1e-4
    }

    /**
     * Restore re-stamps preferences newer than both the clock and the file, capped a few
     * minutes ahead: the rules refuse revisions more than five minutes in the future, and an
     * uncapped value failed the final preferences write after all data had been written.
     * Mirrors web restoredPreferencesRevision.
     */
    fun restoredPreferencesRevision(backupRevision: Long?, now: Long = System.currentTimeMillis()): Long =
        maxOf(now, minOf(backupRevision ?: 0L, now + 239_999L) + 1L)

    /** Category revision for a restore write: the file's value, never later than now. */
    fun restoredCategoryRevision(backupRevision: Long?, now: Long = System.currentTimeMillis()): Long =
        backupRevision?.let { minOf(it, now) } ?: now

    data class BackupPreferences(
        val currency: String,
        val monthlyBudget: Double?,
        val locale: String = "en",
        val themeMode: String = "system",
        val preferencesUpdatedAt: Long? = null,
        val dailyReminder: Boolean? = null,
        val reminderHour: Int? = null,
        val reminderMinute: Int? = null,
        val analyticsPeriod: String? = null,
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
        if (preferences.dailyReminder != null) prefsObj.put("dailyReminder", preferences.dailyReminder)
        if (preferences.reminderHour != null) prefsObj.put("reminderHour", preferences.reminderHour)
        if (preferences.reminderMinute != null) prefsObj.put("reminderMinute", preferences.reminderMinute)
        if (preferences.analyticsPeriod != null) prefsObj.put("analyticsPeriod", preferences.analyticsPeriod)
        root.put("preferences", prefsObj)

        val categoriesArr = JSONArray()
        for (c in categories) {
            val catObj = JSONObject()
            catObj.put("id", c.id)
            catObj.put("name", c.name.trim().take(80))
            catObj.put("iconName", c.iconName.take(63))
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
            expObj.put("note", e.note.take(2000))
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
            // Restore used to coerce anything outside the rules' allowlist to EUR, silently
            // relabelling every amount in the file. Refuse it here instead.
            val cur = prefs.opt("currency")
            if (cur !is String || cur !in SUPPORTED_CURRENCIES) {
                errors.add("preferences.currency must be one of ${SUPPORTED_CURRENCIES.joinToString(", ")}")
            }
            if (prefs.has("monthlyBudget") && !prefs.isNull("monthlyBudget")) {
                val budget = (prefs.opt("monthlyBudget") as? Number)?.toDouble() ?: -1.0
                if (!budget.isFinite() || budget <= 0.0 || budget >= 1_000_000_000.0 || !isCentGranular(budget)) {
                    errors.add("preferences.monthlyBudget must be null or a positive cent amount < 1,000,000,000")
                }
            }
            // Optional fields: older backups omit them, but a present value must have the
            // type every writer produces. Same checks as web validateBackup.
            if (prefs.has("locale") && prefs.opt("locale") !in setOf("en", "de")) {
                errors.add("preferences.locale must be \"en\" or \"de\" when present")
            }
            if (prefs.has("themeMode") && prefs.opt("themeMode") !is String) {
                errors.add("preferences.themeMode must be a string when present")
            }
            if (prefs.has("preferencesUpdatedAt") && (prefs.integralOrNull("preferencesUpdatedAt") ?: -1L) < 0L) {
                errors.add("preferences.preferencesUpdatedAt must be a non-negative integer when present")
            }
            if (prefs.has("dailyReminder") && prefs.opt("dailyReminder") !is Boolean) {
                errors.add("preferences.dailyReminder must be a boolean when present")
            }
            if (prefs.has("reminderHour") && (prefs.integralOrNull("reminderHour") ?: -1L) !in 0L..23L) {
                errors.add("preferences.reminderHour must be an integer 0-23 when present")
            }
            if (prefs.has("reminderMinute") && (prefs.integralOrNull("reminderMinute") ?: -1L) !in 0L..59L) {
                errors.add("preferences.reminderMinute must be an integer 0-59 when present")
            }
            if (prefs.has("analyticsPeriod") && prefs.opt("analyticsPeriod") !is String) {
                errors.add("preferences.analyticsPeriod must be a string when present")
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
                if (id.isBlank() || id.length >= 64 || id.contains('/')) {
                    errors.add("Category at index $i has missing or invalid id")
                } else if (!categoryIds.add(id)) {
                    errors.add("Duplicate category id: \"$id\"")
                }
                val name = cat.optString("name")
                if (name.isBlank() || name.length > 80) {
                    errors.add("Category at index $i name must be between 1 and 80 characters")
                }
                val iconName = cat.optString("iconName")
                if (iconName.isBlank() || iconName.length >= 64) {
                    errors.add("Category at index $i iconName must be a non-empty string under 64 characters")
                }
                val colorInt = (cat.opt("colorInt") as? Number)?.toDouble()
                if (colorInt == null || !colorInt.isFinite() || colorInt < Int.MIN_VALUE.toDouble() || colorInt > Int.MAX_VALUE.toDouble()) {
                    errors.add("Category at index $i colorInt must be a 32-bit integer")
                }
                val sortOrder = (cat.opt("sortOrder") as? Number)?.toDouble()
                if (sortOrder == null || !sortOrder.isFinite() || sortOrder < 0.0 || sortOrder >= 10000.0) {
                    errors.add("Category at index $i sortOrder must be a finite number between 0 and 9999")
                }
                // Restore writes this value back (capped at now), so it must be a plain
                // millisecond number. Zero is allowed, as in web validateBackup.
                if (cat.has("updatedAt") && (cat.integralOrNull("updatedAt") ?: -1L) < 0L) {
                    errors.add("Category at index $i updatedAt must be a non-negative integer timestamp")
                }
                val type = cat.optString("transactionType")
                if (type !in ALLOWED_TRANSACTION_TYPES) {
                    errors.add("Category at index $i has invalid transactionType: \"$type\"")
                }
            }
        }

        val categoryTypeMap = mutableMapOf<String, String>()
        if (categoriesArr != null) {
            for (i in 0 until categoriesArr.length()) {
                val cat = categoriesArr.optJSONObject(i) ?: continue
                val id = cat.optString("id")
                val type = cat.optString("transactionType")
                if (id.isNotBlank() && type in ALLOWED_TRANSACTION_TYPES) {
                    categoryTypeMap[id] = type
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
                if (id.isBlank() || id.length > 64 || id.contains('/')) {
                    errors.add("Expense at index $i has missing or invalid id")
                } else if (!expenseIds.add(id)) {
                    errors.add("Duplicate expense id: \"$id\"")
                }
                // optDouble/optLong coerce numeric strings; web rejects them, so this does too.
                val amount = (exp.opt("amount") as? Number)?.toDouble() ?: -1.0
                if (!amount.isFinite() || amount <= 0.0 || amount >= 1_000_000_000.0) {
                    errors.add("Expense at index $i has invalid amount: must be positive < 1,000,000,000")
                } else if (!isCentGranular(amount)) {
                    errors.add("Expense at index $i has sub-cent precision: $amount")
                }
                val dateMillis = (exp.opt("dateMillis") as? Number)?.toDouble() ?: -1.0
                if (!dateMillis.isFinite() || dateMillis < 946684800000.0 || dateMillis >= 4102444800000.0) {
                    errors.add("Expense at index $i has invalid dateMillis: must be between 2000-01-01 and 2100-01-01 UTC")
                }
                val catId = exp.optString("categoryId")
                if (catId.isBlank() || catId.length >= 64 || catId.contains('/')) {
                    errors.add("Expense at index $i has missing or invalid categoryId")
                } else if (catId !in categoryIds) {
                    // Exporters always include the categories their expenses use (the rules
                    // refuse an expense without one, "0" included). This used to pass whenever
                    // the backup had no categories and then fail mid-restore.
                    errors.add("Expense at index $i references nonexistent categoryId \"$catId\"")
                }
                val note = exp.opt("note")
                if (note !is String || note.length > 2000) {
                    errors.add("Expense at index $i note must be a string up to 2000 characters")
                }
                val type = exp.optString("transactionType")
                if (type !in ALLOWED_TRANSACTION_TYPES) {
                    errors.add("Expense at index $i has invalid transactionType: \"$type\"")
                } else {
                    val catType = categoryTypeMap[catId]
                    if (catId != "0" && catType != null && catType != type) {
                        errors.add("Expense at index $i transactionType \"$type\" does not match category transactionType \"$catType\"")
                    }
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
            dailyReminder = if (prefsObj.has("dailyReminder")) prefsObj.optBoolean("dailyReminder") else null,
            reminderHour = if (prefsObj.has("reminderHour")) prefsObj.optInt("reminderHour") else null,
            reminderMinute = if (prefsObj.has("reminderMinute")) prefsObj.optInt("reminderMinute") else null,
            analyticsPeriod = if (prefsObj.has("analyticsPeriod")) prefsObj.optString("analyticsPeriod") else null,
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
