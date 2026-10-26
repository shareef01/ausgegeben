package com.aus.ausgegeben.ui

import com.aus.ausgegeben.util.CurrencyUtils
import java.util.Calendar

/**
 * Unsaved-changes detection for the add/edit transaction form.
 *
 * The screen used to ask whether *any* field looked filled in, which only works for a
 * blank new transaction — an edited transaction is non-empty the moment it loads, so
 * the discard guard was skipped for edits (`hasUnsavedChanges && !isEditing`) and the
 * back gesture or the close button threw the user's changes away without confirmation.
 * Comparing against the values that were loaded makes one rule correct for both flows.
 *
 * Presentation-only differences are deliberately ignored:
 * - amounts are compared by parsed value, so `12,50` and `12.50` are the same amount;
 * - notes are trimmed, so stray whitespace is not an edit;
 * - dates are compared by local calendar day, because the date picker is day-precision
 *   and re-picking the same day may carry a different time-of-day.
 */
data class TransactionDraftSnapshot(
    val amountText: String,
    val transactionType: TransactionType,
    val categoryId: String?,
    val note: String,
    val dateMillis: Long,
)

/** Whether two instants fall on the same local calendar day. */
internal fun sameLocalDay(a: Long, b: Long): Boolean {
    val ca = Calendar.getInstance().apply { timeInMillis = a }
    val cb = Calendar.getInstance().apply { timeInMillis = b }
    return ca.get(Calendar.ERA) == cb.get(Calendar.ERA) &&
        ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) &&
        ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
}

internal fun isTransactionDraftDirty(
    baseline: TransactionDraftSnapshot?,
    current: TransactionDraftSnapshot,
    currencyCode: String = "EUR",
): Boolean {
    // Nothing has been captured yet (still loading): nothing can be lost, never prompt.
    if (baseline == null) return false

    fun amount(text: String): Double = CurrencyUtils.parseAmount(text, currencyCode) ?: 0.0

    if (amount(current.amountText) != amount(baseline.amountText)) return true
    if (current.transactionType != baseline.transactionType) return true
    if (current.categoryId != baseline.categoryId) return true
    if (current.note.trim() != baseline.note.trim()) return true
    return !sameLocalDay(current.dateMillis, baseline.dateMillis)
}
