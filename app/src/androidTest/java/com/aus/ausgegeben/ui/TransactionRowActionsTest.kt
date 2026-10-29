package com.aus.ausgegeben.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Restaurant
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.theme.AusgegebenTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * The Record row's actions must not hide behind gestures. Long press used to duplicate at
 * once, with no confirmation, and was the only way a sighted touch user could duplicate.
 * Now a visible "more" button and long press both open the same menu.
 */
class TransactionRowActionsTest {

    @get:Rule
    val compose = createComposeRule()

    private var edits = 0
    private var duplicates = 0
    private var deletes = 0

    private fun setRow(
        amount: Double = 12.5,
        widthDp: Int? = null,
        fontScale: Float? = null,
    ) {
        compose.setContent {
            val base = LocalDensity.current
            val density = fontScale?.let { Density(base.density, it) } ?: base
            CompositionLocalProvider(LocalDensity provides density) {
                AusgegebenTheme {
                    Box(if (widthDp != null) Modifier.width(widthDp.dp) else Modifier) {
                        SwipeableTransactionRow(
                            expense = Expense(amount = amount, dateMillis = 0L, categoryId = "c1", note = ""),
                            categoryName = "Groceries",
                            categoryColor = null,
                            icon = Icons.Rounded.Restaurant,
                            currencyCode = "EUR",
                            onClick = { edits++ },
                            onDuplicate = { duplicates++ },
                            onDeleteRequest = { deletes++ },
                        )
                    }
                }
            }
        }
    }

    private fun moreButton() =
        compose.onNodeWithContentDescription("More actions:", substring = true)

    @Test
    fun moreButton_isVisibleAndMeetsTouchTarget() {
        setRow()
        moreButton()
            .assertIsDisplayed()
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun moreButton_opensMenuWithEditDuplicateDelete() {
        setRow()
        moreButton().performClick()
        compose.onNodeWithText("Edit").assertIsDisplayed()
        compose.onNodeWithText("Duplicate for today").assertIsDisplayed()
        compose.onNodeWithText("Delete transaction").assertIsDisplayed()
    }

    @Test
    fun longPress_opensMenuInsteadOfDuplicating() {
        setRow()
        compose.onNodeWithText("Groceries").performTouchInput { longClick() }
        compose.onNodeWithText("Duplicate for today").assertIsDisplayed()
        assertEquals(0, duplicates)
    }

    @Test
    fun menuItems_runTheirActions() {
        setRow()
        moreButton().performClick()
        compose.onNodeWithText("Duplicate for today").performClick()
        assertEquals(1, duplicates)

        moreButton().performClick()
        compose.onNodeWithText("Delete transaction").performClick()
        assertEquals(1, deletes)

        moreButton().performClick()
        compose.onNodeWithText("Edit").performClick()
        assertEquals(1, edits)
    }

    @Test
    fun tapOnRow_stillEdits() {
        setRow()
        compose.onNodeWithText("Groceries").performClick()
        assertEquals(1, edits)
    }

    @Test
    fun narrowRow_fontScale1_3_keepsNameAndAmountReadable() {
        setRow(amount = 123_456_789.99, widthDp = 320, fontScale = 1.3f)
        assertReadable()
    }

    @Test
    fun narrowRow_fontScale2_keepsNameAndAmountReadable() {
        setRow(amount = 123_456_789.99, widthDp = 320, fontScale = 2.0f)
        assertReadable()
    }

    private fun assertReadable() {
        val name = compose.onNodeWithText("Groceries").assertIsDisplayed().getUnclippedBoundsInRoot()
        assertTrue("category name squeezed to ${name.width}", name.width >= 40.dp)
        compose.onNodeWithText("123", substring = true).assertIsDisplayed()
        moreButton().assertIsDisplayed()
    }
}
