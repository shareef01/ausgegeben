package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Recurrence
import com.aus.ausgegeben.data.entity.RecurringTemplate
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecurrenceFallbackAcceptanceTest {
    private val templateId = "550e8400-e29b-41d4-a716-446655440000"
    private val date = "2024-01-31"
    private val expenseId = "a".repeat(64)

    private fun template(over: RecurringTemplate.() -> RecurringTemplate): RecurringTemplate =
        RecurringTemplate(templateId, 15.0, "cat-food", "Rent", "expense", "monthly", 1, date, null, "Europe/Berlin", true, 0, date, 1, 1).over()

    @Test
    fun acceptsAServerConfirmedAdvanceWithAValidCanonicalReceipt() {
        val next = template { copy(nextIndex = 1, nextDate = "2024-02-29", updatedAt = 2) }
        assertTrue(Recurrence.materializeFallbackAcceptance(next, 1, date, true, templateId, date, expenseId, templateId, expenseId))
    }

    @Test
    fun rejectsAnInvalidReceiptEvenWhenTheTemplateAdvanced() {
        val next = template { copy(nextIndex = 1, nextDate = "2024-02-29", updatedAt = 2) }
        assertFalse(Recurrence.materializeFallbackAcceptance(next, 1, date, true, templateId, date, "b".repeat(64), templateId, expenseId))
    }

    @Test
    fun neverAcceptsWithoutACursorAdvanceOrRevisionIncrease() {
        val sameDate = template { copy(updatedAt = 2) }
        assertFalse(Recurrence.materializeFallbackAcceptance(sameDate, 1, date, true, templateId, date, expenseId, templateId, expenseId))
        val sameRevision = template { copy(nextIndex = 1, nextDate = "2024-02-29", updatedAt = 1) }
        assertFalse(Recurrence.materializeFallbackAcceptance(sameRevision, 1, date, true, templateId, date, expenseId, templateId, expenseId))
    }

    @Test
    fun neverAcceptsAMissingTemplate() {
        assertFalse(Recurrence.materializeFallbackAcceptance(null, 1, date, true, templateId, date, expenseId, templateId, expenseId))
    }
}
