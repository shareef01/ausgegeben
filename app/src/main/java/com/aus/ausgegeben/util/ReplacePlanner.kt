package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.SyncedPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import java.security.MessageDigest

object ReplacePlanner {
    enum class RestorePhase {
        PREPARING,
        SNAPSHOT_READY,
        APPLYING,
        VERIFYING,
        COMPLETED,
        ROLLING_BACK,
        ROLLED_BACK,
        FAILED_RECOVERABLE
    }

    data class PlannedCounts(
        val backupExpenseCount: Int,
        val backupCategoryCount: Int,
        val expensesToUpsertCount: Int,
        val expensesToDeleteCount: Int,
        val categoriesToUpsertCount: Int,
        val categoriesPreservedCount: Int,
    )

    data class ReplacePlan(
        val expensesToUpsert: List<BackupFormat.ParsedExpense>,
        val expenseIdsToDelete: List<String>,
        val categoriesToUpsert: List<BackupFormat.ParsedCategory>,
        val categoryIdsToPreserve: List<String>,
        val preferencesToUpdate: SyncedPreferences,
        val conflicts: List<String>,
        val counts: PlannedCounts,
    )

    data class RestoreJournalProgress(
        val step: String? = null,
        val batchIndex: Int? = null,
        val totalBatches: Int? = null,
        val lastProcessedId: String? = null,
    )

    data class SnapshotMeta(
        val chunkCount: Int,
        val totalExpenses: Int,
        val totalCategories: Int,
    )

    data class RestoreOperationDoc(
        val operationId: String,
        val ownerUid: String,
        val mode: String = "replace",
        val backupFingerprint: String,
        val phase: RestorePhase,
        val createdAt: Long,
        val updatedAt: Long,
        val plannedCounts: PlannedCounts? = null,
        val progress: RestoreJournalProgress? = null,
        val snapshotMeta: SnapshotMeta? = null,
        val error: String? = null,
        val failedFromPhase: RestorePhase? = null,
        val initiatorPlatform: String = "android",
    )

    data class ReplaceFaultHooks(
        val failAfterSnapshot: Boolean = false,
        val failAfterCategoryBatch: Int? = null,
        val failAfterExpenseUpsertBatch: Int? = null,
        val failAfterExpenseDeleteBatch: Int? = null,
        val failBeforePreferences: Boolean = false,
        val failDuringVerification: Boolean = false,
        val failDuringRollback: Boolean = false,
    )

    data class ReplaceResult(
        val success: Boolean,
        val operationId: String,
        val plan: ReplacePlan,
        val phase: RestorePhase,
    )

    fun computeBackupFingerprint(backup: BackupFormat.ParsedBackup): String {
        val canonicalExpenses = backup.expenses
            .map { "${it.id},${it.amount},${it.dateMillis},${it.categoryId},${it.transactionType}" }
            .sorted()
            .joinToString(";")
        val canonicalCategories = backup.categories
            .map { "${it.id},${it.name},${it.transactionType}" }
            .sorted()
            .joinToString(";")
        val canonicalPrefs = "${backup.preferences.currency},${backup.preferences.monthlyBudget ?: "null"},${backup.preferences.locale},${backup.preferences.themeMode}"
        val budgetPart = if (backup.schemaVersion >= 2) ":" + org.json.JSONArray(backup.categoryBudgets.sortedBy { it.categoryId }.map { listOf(it.categoryId, CurrencyUtils.toMinorUnits(it.monthlyLimit), it.warningThresholdPercent) }).toString() else ""
        val recurringPart = if (backup.schemaVersion >= 3 && backup.recurring != null) {
            val templatesArray = org.json.JSONArray()
            backup.recurring.templates.sortedBy { it.id }.forEach { t ->
                val tArr = org.json.JSONArray()
                tArr.put(t.id)
                tArr.put(CurrencyUtils.toMinorUnits(t.amount))
                tArr.put(t.categoryId)
                tArr.put(t.note)
                tArr.put(t.transactionType)
                tArr.put(t.frequency)
                tArr.put(t.interval)
                tArr.put(t.startDate)
                tArr.put(t.endDate ?: org.json.JSONObject.NULL)
                tArr.put(t.timeZone)
                tArr.put(t.enabled)
                tArr.put(t.nextIndex)
                tArr.put(t.nextDate)
                tArr.put(t.createdAt)
                tArr.put(t.updatedAt)
                templatesArray.put(tArr)
            }
            val receiptsArray = org.json.JSONArray()
            backup.recurring.receipts.sortedBy { it.id }.forEach { r ->
                val rArr = org.json.JSONArray()
                rArr.put(r.id)
                rArr.put(r.templateId)
                rArr.put(r.scheduledDate)
                rArr.put(r.expenseId)
                rArr.put(r.createdAt)
                receiptsArray.put(rArr)
            }
            val recurringArray = org.json.JSONArray()
            recurringArray.put(templatesArray)
            recurringArray.put(receiptsArray)
            ":" + recurringArray.toString()
        } else ""
        val raw = "v${backup.schemaVersion}:${backup.exportedAt}:$canonicalExpenses:$canonicalCategories:$canonicalPrefs$budgetPart$recurringPart"

        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(raw.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    fun planReplace(
        currentExpenses: List<Expense>,
        currentCategories: List<Category>,
        currentPreferences: SyncedPreferences?,
        backup: BackupFormat.ParsedBackup,
    ): ReplacePlan {
        val conflicts = mutableListOf<String>()

        if (backup.schemaVersion !in setOf(1, 2, 3)) {
            conflicts.add("UNSUPPORTED_SCHEMA_VERSION: ${backup.schemaVersion}")
        }

        val currentCatMap = currentCategories.associateBy { it.id }
        val backupCatMap = backup.categories.associateBy { it.id }

        for (c in backup.categories) {
            val existing = currentCatMap[c.id]
            if (existing != null && existing.transactionType != c.transactionType) {
                conflicts.add("CATEGORY_TYPE_CONFLICT: ${c.name} (${existing.transactionType} vs ${c.transactionType})")
            }
        }

        for (e in backup.expenses) {
            if (e.categoryId != "0" && !backupCatMap.containsKey(e.categoryId) && !currentCatMap.containsKey(e.categoryId)) {
                conflicts.add("CATEGORY_ORPHAN_REFERENCE: Expense ${e.id} references non-existent category ${e.categoryId}")
            }
        }

        if (backup.schemaVersion == 3 && backup.recurring != null) {
            for (t in backup.recurring.templates) {
                if (!backupCatMap.containsKey(t.categoryId) && !currentCatMap.containsKey(t.categoryId)) {
                    conflicts.add("CATEGORY_ORPHAN_REFERENCE: Recurring template ${t.id} references non-existent category ${t.categoryId}")
                }
            }
        }

        val expensesToUpsert = backup.expenses
        val backupExpenseIds = backup.expenses.map { it.id }.toSet()
        val expenseIdsToDelete = currentExpenses.filter { it.id !in backupExpenseIds }.map { it.id }

        val categoriesToUpsert = backup.categories
        val categoryIdsToPreserve = currentCategories.filter { it.id !in backupCatMap }.map { it.id }

        val newTimestamp = maxOf(System.currentTimeMillis(), (backup.preferences.preferencesUpdatedAt ?: 0L) + 1L)
        val validCurrencies = setOf("EUR", "USD", "GBP", "CHF")
        val validLocales = setOf("en", "de")
        val validThemes = setOf(
            "light", "dark", "system", "amoled", "midnight",
            "ocean", "forest", "sunset", "lavender", "soft_light"
        )

        val cur = if (backup.preferences.currency in validCurrencies) backup.preferences.currency else (currentPreferences?.currency ?: "EUR")
        val loc = if (backup.preferences.locale in validLocales) backup.preferences.locale else (currentPreferences?.locale ?: "en")
        val theme = if (backup.preferences.themeMode in validThemes) backup.preferences.themeMode else (currentPreferences?.themeMode ?: "system")
        val budget = backup.preferences.monthlyBudget?.takeIf { it > 0.0 && it < 1_000_000_000.0 } ?: currentPreferences?.monthlyBudget

        val preferencesToUpdate = SyncedPreferences(
            currency = cur,
            locale = loc,
            themeMode = theme,
            onboardingComplete = currentPreferences?.onboardingComplete ?: true,
            dailyReminder = currentPreferences?.dailyReminder ?: true,
            reminderHour = currentPreferences?.reminderHour ?: 19,
            reminderMinute = currentPreferences?.reminderMinute ?: 0,
            analyticsPeriod = currentPreferences?.analyticsPeriod ?: "this_month",
            monthlyBudget = budget,
            updatedAt = newTimestamp,
        )

        return ReplacePlan(
            expensesToUpsert = expensesToUpsert,
            expenseIdsToDelete = expenseIdsToDelete,
            categoriesToUpsert = categoriesToUpsert,
            categoryIdsToPreserve = categoryIdsToPreserve,
            preferencesToUpdate = preferencesToUpdate,
            conflicts = conflicts,
            counts = PlannedCounts(
                backupExpenseCount = backup.expenses.size,
                backupCategoryCount = backup.categories.size,
                expensesToUpsertCount = expensesToUpsert.size,
                expensesToDeleteCount = expenseIdsToDelete.size,
                categoriesToUpsertCount = categoriesToUpsert.size,
                categoriesPreservedCount = categoryIdsToPreserve.size,
            ),
        )
    }
}
