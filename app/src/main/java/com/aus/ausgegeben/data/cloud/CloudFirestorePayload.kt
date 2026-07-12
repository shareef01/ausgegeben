package com.aus.ausgegeben.data.cloud

import com.aus.ausgegeben.data.SyncedPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.google.firebase.firestore.FieldValue

/**
 * Normalizes local values into Firestore rule-compliant write payloads.
 * Merge writes must always overwrite legacy invalid fields (e.g. local file receipt paths).
 */
internal object CloudFirestorePayload {
    fun category(category: Category, deleted: Boolean = false): Map<String, Any> = mapOf(
        "cloudId" to category.cloudId.trim(),
        "name" to category.name.trim().ifBlank { "Category" },
        "iconName" to category.iconName.trim().ifBlank { "shopping_bag" },
        "colorInt" to category.colorInt,
        "transactionType" to validTransactionType(category.transactionType),
        "sortOrder" to category.sortOrder.coerceIn(-10_000, 10_000),
        "updatedAt" to FieldValue.serverTimestamp(),
        "deleted" to deleted,
    )

    fun category(record: CloudCategoryRecord, deleted: Boolean = false): Map<String, Any> = mapOf(
        "cloudId" to record.cloudId.trim(),
        "name" to record.name.trim().ifBlank { "Category" },
        "iconName" to record.iconName.trim().ifBlank { "shopping_bag" },
        "colorInt" to record.colorInt,
        "transactionType" to validTransactionType(record.transactionType),
        "sortOrder" to record.sortOrder.coerceIn(-10_000, 10_000),
        "updatedAt" to FieldValue.serverTimestamp(),
        "deleted" to deleted,
    )

    fun expense(expense: Expense, categoryCloudId: String, deleted: Boolean = false): Map<String, Any>? {
        val cloudCategoryId = categoryCloudId.trim()
        if (cloudCategoryId.isEmpty()) return null
        return mapOf(
            "cloudId" to expense.cloudId.trim(),
            "amount" to expense.amount.coerceIn(-999_999_999.0, 999_999_999.0),
            "dateMillis" to expense.dateMillis.coerceAtLeast(0L),
            "categoryId" to expense.categoryId,
            "categoryCloudId" to cloudCategoryId,
            "note" to expense.note,
            "receiptImagePath" to safeReceiptPathField(expense.receiptImagePath),
            "transactionType" to validTransactionType(expense.transactionType),
            "updatedAt" to FieldValue.serverTimestamp(),
            "deleted" to deleted,
        )
    }

    fun expense(record: CloudExpenseRecord, deleted: Boolean = false): Map<String, Any>? {
        val cloudCategoryId = record.categoryCloudId.trim()
        if (cloudCategoryId.isEmpty()) return null
        return mapOf(
            "cloudId" to record.cloudId.trim(),
            "amount" to record.amount.coerceIn(-999_999_999.0, 999_999_999.0),
            "dateMillis" to record.dateMillis.coerceAtLeast(0L),
            "categoryId" to record.categoryId,
            "categoryCloudId" to cloudCategoryId,
            "note" to record.note,
            "receiptImagePath" to safeReceiptPathField(record.receiptImagePath),
            "transactionType" to validTransactionType(record.transactionType),
            "updatedAt" to FieldValue.serverTimestamp(),
            "deleted" to deleted,
        )
    }

    fun preferences(prefs: SyncedPreferences): Map<String, Any> {
        val payload = linkedMapOf<String, Any>(
            "currency" to validCurrency(prefs.currency),
            "locale" to if (prefs.locale == "de") "de" else "en",
            "themeMode" to prefs.themeMode.storageKey,
            "dailyReminder" to prefs.dailyReminder,
            "reminderHour" to prefs.reminderHour.coerceIn(0, 23),
            "reminderMinute" to prefs.reminderMinute.coerceIn(0, 59),
            "analyticsPeriod" to prefs.analyticsPeriod.take(64).ifBlank { "this_month" },
            "recordListPeriod" to if (prefs.recordListPeriod == "all_time") "all_time" else "this_month",
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        prefs.monthlyBudget?.takeIf { it > 0 }?.let { payload["monthlyBudget"] = it }
        return payload
    }

    /**
     * Rules allow null, empty string, or receipt:// paths. Always send a value so merge
     * overwrites legacy local file paths that would otherwise fail validation.
     */
    private fun safeReceiptPathField(path: String?): String =
        path?.takeIf { it.startsWith(ReceiptFileUtils.RECEIPT_PREFIX) } ?: ""

    private fun validTransactionType(value: String): String =
        when (value) {
            "income", "transfer" -> value
            else -> "expense"
        }

    private fun validCurrency(value: String): String {
        val trimmed = value.trim().ifBlank { "EUR" }.take(8)
        return trimmed.takeIf { it.length >= 3 } ?: "EUR"
    }
}
