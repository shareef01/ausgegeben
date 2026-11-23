package com.aus.ausgegeben.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * Regression cover for the category budget amount line's semantic colour.
 *
 * The card used to pick the expense (red) ink whenever `overspent > 0`. A projected overage
 * also has `overspent > 0` — it is the anticipated total minus the limit — so a card whose
 * actual spending was still inside the limit painted its overage red while the status label
 * above it was amber. Red must stay reserved for money actually spent beyond the limit.
 */
class CategoryBudgetAmountToneTest {

    @Test
    fun actualOverspend_usesExpenseInk() {
        assertEquals(CategoryBudgetAmountTone.Expense, categoryBudgetAmountTone("over"))
    }

    @Test
    fun projectedOverage_usesWarningInk() {
        assertEquals(CategoryBudgetAmountTone.Warning, categoryBudgetAmountTone("projected"))
    }

    @Test
    fun projectedOverage_neverUsesExpenseInk() {
        // The exact regression: an anticipated-only overage must not read as an actual one.
        assertNotEquals(CategoryBudgetAmountTone.Expense, categoryBudgetAmountTone("projected"))
    }

    @Test
    fun remainingStates_useNeutralInk() {
        listOf("reached", "warning", "normal").forEach { state ->
            assertEquals(state, CategoryBudgetAmountTone.Secondary, categoryBudgetAmountTone(state))
        }
    }

    @Test
    fun unknownState_staysNeutral() {
        assertEquals(CategoryBudgetAmountTone.Secondary, categoryBudgetAmountTone(""))
        assertEquals(CategoryBudgetAmountTone.Secondary, categoryBudgetAmountTone("unexpected"))
    }
}
