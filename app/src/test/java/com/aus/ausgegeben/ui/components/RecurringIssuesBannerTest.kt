package com.aus.ausgegeben.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.aus.ausgegeben.ui.RecurringIssueState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Render-level verification for the recurring quarantine warning.
 *
 * The business state (showWarning / affectedTemplates / fullyReconciled) is JVM-tested
 * separately; these tests assert only that the composable renders or stays empty for a given
 * state. No repair or destructive control exists in this component by design.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RecurringIssuesBannerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun set(state: RecurringIssueState) {
        compose.setContent { MaterialTheme { RecurringIssuesBanner(state) } }
    }

    @Test
    fun rendersTheWarningWhenAQuarantineIsConfirmed() {
        set(RecurringIssueState(affectedTemplates = 2, error = false, syncing = false))
        // The string resource formats %1$d with the affected-template count.
        compose.onNodeWithText("Some recurring transactions need attention. Scheduled transactions for 2 affected item(s) may not have been recorded.").assertIsDisplayed()
    }

    @Test
    fun rendersNothingForAHealthyAccount() {
        set(RecurringIssueState(affectedTemplates = 0, error = false, syncing = false))
        // With zero affected templates the banner renders no nodes at all.
        compose.onNodeWithText("Some recurring transactions need attention", substring = true)
            .assertDoesNotExist()
    }

    @Test
    fun remainsVisibleWhileASyncErrorIsAlsoPresent() {
        set(RecurringIssueState(affectedTemplates = 1, error = true, syncing = false))
        compose.onNodeWithText("Some recurring transactions need attention. Scheduled transactions for 1 affected item(s) may not have been recorded.").assertIsDisplayed()
    }
}
