package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AusgegebenTheme
import org.junit.Rule
import org.junit.Test

/**
 * Android's minimum touch target is 48dp. The shared button components are the
 * choke point for it — every screen builds on them — so pinning the floor here
 * covers the whole app rather than one screen at a time.
 *
 * This exists because AppIconButton shipped at 44dp (Apple's minimum, not
 * Android's) across eight call sites, including a row on CategoryScreen where
 * move-up, move-down, edit and delete sit shoulder to shoulder. Unlike
 * Material3's IconButton, these are bare Boxes with a clickable modifier, so
 * nothing expands the touch bounds automatically and a regression is invisible
 * until someone measures it.
 */
class TouchTargetTest {

    @get:Rule
    val compose = createComposeRule()

    private val minTarget = 48.dp

    @Test
    fun appIconButton_meetsMinimumTouchTarget() {
        compose.setContent {
            AusgegebenTheme {
                AppIconButton(
                    onClick = {},
                    icon = Icons.Rounded.Edit,
                    contentDescription = "edit",
                )
            }
        }

        compose.onNodeWithContentDescription("edit")
            .assertWidthIsAtLeast(minTarget)
            .assertHeightIsAtLeast(minTarget)
    }

    @Test
    fun appIconButton_stillMeetsTargetWhenDisabled() {
        compose.setContent {
            AusgegebenTheme {
                AppIconButton(
                    onClick = {},
                    icon = Icons.Rounded.KeyboardArrowUp,
                    contentDescription = "move up",
                    enabled = false,
                )
            }
        }

        compose.onNodeWithContentDescription("move up")
            .assertWidthIsAtLeast(minTarget)
            .assertHeightIsAtLeast(minTarget)
    }

    /** The CategoryScreen action cluster: four adjacent targets, one destructive. */
    @Test
    fun adjacentRowActions_eachMeetMinimumTouchTarget() {
        compose.setContent {
            AusgegebenTheme {
                Row {
                    AppIconButton({}, Icons.Rounded.KeyboardArrowUp, "move up")
                    AppIconButton({}, Icons.Rounded.KeyboardArrowDown, "move down")
                    AppIconButton({}, Icons.Rounded.Edit, "edit")
                    AppIconButton({}, Icons.Rounded.DeleteOutline, "delete")
                }
            }
        }

        for (label in listOf("move up", "move down", "edit", "delete")) {
            compose.onNodeWithContentDescription(label)
                .assertWidthIsAtLeast(minTarget)
                .assertHeightIsAtLeast(minTarget)
        }
    }

    @Test
    fun appButton_meetsMinimumTouchTarget() {
        compose.setContent {
            AusgegebenTheme {
                AppButton(onClick = {}) { Text("save") }
            }
        }

        compose.onNodeWithText("save").assertHeightIsAtLeast(minTarget)
    }

    @Test
    fun appFab_meetsMinimumTouchTarget() {
        compose.setContent {
            AusgegebenTheme {
                AppFab(onClick = {}, icon = Icons.Rounded.Edit, contentDescription = "add")
            }
        }

        compose.onNodeWithContentDescription("add")
            .assertWidthIsAtLeast(minTarget)
            .assertHeightIsAtLeast(minTarget)
    }
}
