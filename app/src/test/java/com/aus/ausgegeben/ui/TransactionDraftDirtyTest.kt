package com.aus.ausgegeben.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

/**
 * Unsaved-changes detection for the add/edit form. Regression coverage for the defect
 * where an edited transaction counted as "clean" (any-field-filled logic) and could be
 * closed with the back gesture or the X button without a discard confirmation.
 */
class TransactionDraftDirtyTest {

    private fun at(year: Int, month: Int, day: Int, hour: Int = 12): Long =
        Calendar.getInstance().apply {
            clear()
            set(year, month, day, hour, 0, 0)
        }.timeInMillis

    private val day = at(2026, Calendar.OCTOBER, 24)

    private fun draft(
        amountText: String = "12,50",
        transactionType: TransactionType = TransactionType.EXPENSE,
        categoryId: String? = "food",
        note: String = "  Lunch  ",
        dateMillis: Long = day,
    ) = TransactionDraftSnapshot(amountText, transactionType, categoryId, note, dateMillis)

    @Test
    fun unchangedDraftIsClean() {
        assertFalse(isTransactionDraftDirty(draft(), draft(), "EUR"))
    }

    @Test
    fun equivalentAmountFormatsAreClean() {
        assertFalse(isTransactionDraftDirty(draft(amountText = "12,50"), draft(amountText = "12.5"), "EUR"))
        assertFalse(isTransactionDraftDirty(draft(amountText = "12.50"), draft(amountText = "12,50"), "EUR"))
    }

    @Test
    fun changedOrClearedAmountIsDirty() {
        assertTrue(isTransactionDraftDirty(draft(), draft(amountText = "13,00"), "EUR"))
        assertTrue(isTransactionDraftDirty(draft(), draft(amountText = ""), "EUR"))
    }

    @Test
    fun noteWhitespaceIsNotAnEditButTextIs() {
        assertFalse(isTransactionDraftDirty(draft(note = "Lunch"), draft(note = "  Lunch "), "EUR"))
        assertTrue(isTransactionDraftDirty(draft(), draft(note = "Dinner"), "EUR"))
        assertTrue(isTransactionDraftDirty(draft(note = "Lunch"), draft(note = ""), "EUR"))
    }

    @Test
    fun typeOrCategoryChangeIsDirty() {
        assertTrue(isTransactionDraftDirty(draft(), draft(transactionType = TransactionType.INCOME), "EUR"))
        assertTrue(isTransactionDraftDirty(draft(), draft(categoryId = "other"), "EUR"))
        assertTrue(isTransactionDraftDirty(draft(categoryId = null), draft(categoryId = "food"), "EUR"))
    }

    @Test
    fun sameDayDifferentTimeIsCleanButAnotherDayIsDirty() {
        val laterSameDay = at(2026, Calendar.OCTOBER, 24, hour = 23)
        val nextDay = at(2026, Calendar.OCTOBER, 25, hour = 1)
        assertTrue(sameLocalDay(day, laterSameDay))
        assertFalse(isTransactionDraftDirty(draft(), draft(dateMillis = laterSameDay), "EUR"))
        assertFalse(sameLocalDay(day, nextDay))
        assertTrue(isTransactionDraftDirty(draft(), draft(dateMillis = nextDay), "EUR"))
    }

    @Test
    fun noBaselineNeverReportsDirty() {
        assertFalse(isTransactionDraftDirty(null, draft(), "EUR"))
    }

    /**
     * The discard decision must be taken when the user closes the form, not when the
     * composition that produced the lambda ran. A captured Boolean said "clean" for an
     * edit that had just been changed (runtime: `captured=false recomputed=true`).
     */
    @Test
    fun discardPrompt_isEvaluatedAtCloseTimeNotCaptureTime() {
        var dirty = false
        val close = { discardPromptRequired(isLoading = false) { dirty } }

        assertFalse("composed while clean", close())

        dirty = true
        assertTrue("the same lambda must see the change", close())
    }

    @Test
    fun discardPrompt_isAlwaysFalseWhileTheDraftLoads() {
        // The form is a spinner, so nothing can have been typed and closing is safe.
        assertFalse(discardPromptRequired(isLoading = true) { true })
        assertTrue(discardPromptRequired(isLoading = false) { true })
    }
}
