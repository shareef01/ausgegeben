package com.aus.ausgegeben.ui.components

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.platform.app.InstrumentationRegistry
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AusgegebenTheme
import com.aus.ausgegeben.util.CurrencyUtils
import java.text.NumberFormat
import org.junit.Rule
import org.junit.Test

class BudgetProgressBarTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun showsActualOverspendAndWithholdsUnconfirmedRemainingAmount() {
        val spent = mutableStateOf(125.0)
        val incomplete = mutableStateOf(false)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        fun amount(value: Double) = CurrencyUtils.formatAmount(value, "EUR")

        compose.setContent {
            AusgegebenTheme {
                BudgetProgressBar(spent.value, 100.0, "EUR", incomplete = incomplete.value)
            }
        }

        val percent = NumberFormat.getPercentInstance(CurrencyUtils.localeForDisplay()).format(1.25)
        compose.onNodeWithText(context.getString(R.string.budget_used, percent)).assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.budget_over_by, amount(25.0))).assertIsDisplayed()

        compose.runOnIdle { spent.value = 85.0 }
        val remaining = context.getString(R.string.budget_remaining, amount(15.0))
        compose.onNodeWithText(remaining).assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.budget_near_limit)).assertIsDisplayed()

        compose.runOnIdle { incomplete.value = true }
        compose.onNodeWithText(remaining).assertDoesNotExist()
        compose.onNodeWithText(context.getString(R.string.record_cache_incomplete)).assertIsDisplayed()
    }
}
