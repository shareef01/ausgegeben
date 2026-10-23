package com.aus.ausgegeben.util

import java.time.Instant
import java.time.ZoneId

/**
 * Normalised snapshot of the transaction editor's fields, used to decide whether closing the
 * editor would discard a real change (UX-1).
 *
 * Android parity with the web client (`web/src/viewmodels/useAddTransactionViewModel.ts`,
 * `toTransactionBaseline` / `isFormDirty`). The editor used to ask "does this form look
 * non-empty?" instead of "did the user change anything": a loaded edit always looks non-empty,
 * so edits had to be excluded from the guard — and excluding them meant tapping Back on an
 * edited transaction threw the changes away with no prompt.
 *
 * The comparison is on what `saveExpense` would persist, never on formatting:
 *  - `amountMinor` is cents, so `12,5` and `12,50` are the same amount;
 *  - `dateKey` is the local calendar day, so the time-of-day a stored `dateMillis` carries is
 *    not counted as an edit when only the date is on screen;
 *  - `note` is trimmed, matching the save path.
 */
data class TransactionDraft(
    val amountMinor: Long,
    val transactionType: String,
    val categoryId: String?,
    val note: String,
    val dateKey: String,
) {
    companion object {
        /** Builds a draft from the values the editor is currently showing. */
        fun of(
            amountText: String,
            currencyCode: String,
            transactionType: String,
            categoryId: String?,
            note: String,
            dateMillis: Long,
            zone: ZoneId = ZoneId.systemDefault(),
        ): TransactionDraft = TransactionDraft(
            amountMinor = CurrencyUtils.toMinorUnits(CurrencyUtils.parseAmount(amountText, currencyCode) ?: 0.0),
            transactionType = transactionType,
            categoryId = categoryId,
            note = note.trim(),
            dateKey = Instant.ofEpochMilli(dateMillis).atZone(zone).toLocalDate().toString(),
        )

        /**
         * Whether closing would lose something. `baseline` is null until the editor has finished
         * loading, and an unloaded editor is never dirty.
         */
        fun isDirty(current: TransactionDraft, baseline: TransactionDraft?): Boolean =
            baseline != null && current != baseline
    }
}
