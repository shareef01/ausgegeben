package com.aus.ausgegeben.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Insights totals dock labels its expense total "anticipated" only when a future-dated
 * expense is counted, but its net becomes "anticipated net cash flow" when *either* side has a
 * future-dated row. Future-dated income used to be ignored, so a month whose net was already
 * inflated by unearned income still read as a plain "net cash flow".
 *
 * Mirrored case for case in web `insightsTotals.test.ts`; both clients must agree.
 */
class InsightsTotalsDisclosureTest {

    @Test
    fun neitherSideHasAFutureRow_bothLabelsStayActual() {
        val disclosure = totalsDisclosure(upcomingExpense = 0.0, upcomingIncome = 0.0)
        assertFalse(disclosure.expenseIsAnticipated)
        assertFalse(disclosure.netIsAnticipated)
    }

    @Test
    fun futureDatedExpenseOnly_expenseAndNetAreBothAnticipated() {
        val disclosure = totalsDisclosure(upcomingExpense = 25.0, upcomingIncome = 0.0)
        assertTrue(disclosure.expenseIsAnticipated)
        assertTrue(disclosure.netIsAnticipated)
    }

    @Test
    fun futureDatedIncomeOnly_netIsAnticipatedWhileExpenseTotalStaysActual() {
        val disclosure = totalsDisclosure(upcomingExpense = 0.0, upcomingIncome = 40.0)
        assertFalse(disclosure.expenseIsAnticipated)
        assertTrue(disclosure.netIsAnticipated)
    }

    @Test
    fun bothSidesFutureDated_expenseAndNetAreBothAnticipated() {
        val disclosure = totalsDisclosure(upcomingExpense = 25.0, upcomingIncome = 40.0)
        assertTrue(disclosure.expenseIsAnticipated)
        assertTrue(disclosure.netIsAnticipated)
    }

    @Test
    fun subCentAmount_isNotAContributingRow() {
        assertFalse(totalsDisclosure(upcomingExpense = 0.004, upcomingIncome = 0.0).netIsAnticipated)
        assertFalse(totalsDisclosure(upcomingExpense = 0.0, upcomingIncome = 0.004).netIsAnticipated)
    }

    @Test
    fun oneCent_isAContributingRow() {
        val disclosure = totalsDisclosure(upcomingExpense = 0.01, upcomingIncome = 0.0)
        assertTrue(disclosure.expenseIsAnticipated)
        assertTrue(disclosure.netIsAnticipated)
    }
}
