package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.RecurringIssue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecurringIssueStateTest {
    private fun issue(templateId: String) = RecurringIssue(
        code = "RECURRING_RECEIPT_INVALID",
        templateId = templateId,
        scheduledDate = "2024-01-31",
        receiptId = templateId + "_2024-01-31",
        receiptExpenseId = "b".repeat(64),
        expectedExpenseId = "a".repeat(64),
    )

    @Test fun healthyRunShowsNoWarning() {
        val state = recurringIssueState(emptyList(), error = false, syncing = false)
        assertFalse(state.showWarning)
        assertTrue(state.fullyReconciled)
    }

    @Test fun countsAffectedTemplatesNotOccurrences() {
        val state = recurringIssueState(listOf(issue("t1"), issue("t1"), issue("t2")), false, false)
        assertEquals(2, state.affectedTemplates)
        assertTrue(state.showWarning)
        assertFalse(state.fullyReconciled)
    }

    @Test fun confirmedIssueSurvivesAFailedPass() {
        val state = recurringIssueState(listOf(issue("t1")), error = true, syncing = false)
        assertTrue("a sync failure must not hide a confirmed issue", state.showWarning)
        assertFalse("and must not be reported as fully reconciled", state.fullyReconciled)
    }

    @Test fun warningDisappearsOnlyAfterVerifiedHealthyPass() {
        assertTrue(recurringIssueState(listOf(issue("t1")), false, false).showWarning)
        assertFalse(recurringIssueState(emptyList(), error = false, syncing = false).showWarning)
    }

    @Test fun syncInProgressIsNotFullSuccess() {
        val state = recurringIssueState(emptyList(), error = false, syncing = true)
        assertFalse("an in-flight pass is neither failed nor verified", state.fullyReconciled)
    }
}
