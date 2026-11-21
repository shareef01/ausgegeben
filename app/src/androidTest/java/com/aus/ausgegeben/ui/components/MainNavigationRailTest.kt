package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class MainNavigationRailTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun settingsRemainsReachableInAShortWindow() {
        lateinit var recordLabel: String
        lateinit var settingsLabel: String
        compose.setContent {
            recordLabel = stringResource(R.string.nav_record)
            settingsLabel = stringResource(R.string.nav_settings)
            var selectedTab by remember { mutableStateOf<Route>(Route.ExpenseList) }
            Box(Modifier.height(132.dp)) {
                MainNavigationRail(currentRoute = selectedTab, onNavigate = { selectedTab = it })
            }
        }

        val tab = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)
        compose.onAllNodes(tab).assertCountEquals(3)
        val record = compose.onNode(tab and hasContentDescription(recordLabel))
        val settings = compose.onNode(tab and hasContentDescription(settingsLabel))
        record.assertIsSelected()
        settings.performScrollTo().assertIsDisplayed().performClick()
        settings.assertIsSelected()
        record.assertIsNotSelected()
    }

    @Test
    fun titleTapsAndSwipesReachTheirOwnActions() {
        var buttonTaps = 0
        var nextSwipes = 0
        compose.setContent {
            SwipeableTabSurface(
                canSwipeToPrevious = false,
                canSwipeToNext = true,
                onSwipeToPrevious = {},
                onSwipeToNext = { nextSwipes++ },
                modifier = Modifier.testTag("tab surface"),
            ) {
                ScreenTitle("Record", action = {
                    AppTextButton(onClick = { buttonTaps++ }, text = "Add transaction")
                })
            }
        }

        compose.onNodeWithText("Add transaction").performTouchInput { click() }
        compose.onNodeWithTag("tab surface").performTouchInput {
            val belowTitle = height * 0.7f
            val withinTitle = 20.dp.toPx()
            swipe(start = Offset(width * 0.85f, belowTitle), end = Offset(width * 0.15f, belowTitle))
            swipe(start = Offset(width * 0.85f, withinTitle), end = Offset(width * 0.15f, withinTitle))
        }
        compose.runOnIdle {
            assertEquals(1, buttonTaps)
            assertEquals(1, nextSwipes)
        }
    }
}
