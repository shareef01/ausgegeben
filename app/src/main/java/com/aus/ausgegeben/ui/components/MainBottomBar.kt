package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppSpringSnappy

/** Total visual height of the bottom shell including the raised add button. */
val MainBottomBarHeight = 76.dp

private const val TAB_SLOT_COUNT = 4

private val TabRowHeight = 56.dp
private val NavIconSize = 26.dp
private val SelectionChipSize = 48.dp
private val AddButtonSize = 52.dp

private data class NavTab(
    val slotIndex: Int,
    val route: Route,
    val icon: ImageVector,
    val label: String,
)

@Composable
fun MainBottomBar(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    onAddClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tabs = listOf(
        NavTab(
            slotIndex = 0,
            route = Route.ExpenseList,
            icon = Icons.AutoMirrored.Rounded.ViewList,
            label = stringResource(R.string.nav_record),
        ),
        NavTab(
            slotIndex = 1,
            route = Route.CategoryManagement,
            icon = Icons.Rounded.PieChart,
            label = stringResource(R.string.nav_bills),
        ),
        NavTab(
            slotIndex = 3,
            route = Route.Settings,
            icon = Icons.Rounded.Settings,
            label = stringResource(R.string.nav_settings),
        ),
    )

    val selectedSlot = tabs.firstOrNull { tab ->
        when (tab.route) {
            Route.ExpenseList -> currentRoute is Route.ExpenseList
            Route.CategoryManagement -> currentRoute is Route.CategoryManagement
            Route.Settings -> currentRoute is Route.Settings
            else -> false
        }
    }?.slotIndex ?: 0

    val addLabel = stringResource(R.string.nav_add_transaction)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(MainBottomBarHeight)
            .background(AppColors.Background),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(TabRowHeight),
        ) {
            val slotWidth = maxWidth / TAB_SLOT_COUNT
            val chipOffset by animateDpAsState(
                targetValue = slotWidth * selectedSlot + (slotWidth - SelectionChipSize) / 2,
                animationSpec = AppDpSpring,
                label = "navChip",
            )

            Box(
                modifier = Modifier
                    .offset(x = chipOffset)
                    .size(SelectionChipSize)
                    .align(Alignment.CenterStart)
                    .clip(CircleShape)
                    .background(AppColors.CardSurface)
                    .border(1.dp, AppColors.CardBorder, CircleShape),
            )

            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NavIconSlot(
                    icon = tabs[0].icon,
                    label = tabs[0].label,
                    isSelected = selectedSlot == 0,
                    onClick = { onNavigate(tabs[0].route) },
                    modifier = Modifier.weight(1f),
                )
                NavIconSlot(
                    icon = tabs[1].icon,
                    label = tabs[1].label,
                    isSelected = selectedSlot == 1,
                    onClick = { onNavigate(tabs[1].route) },
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.weight(1f))
                NavIconSlot(
                    icon = tabs[2].icon,
                    label = tabs[2].label,
                    isSelected = selectedSlot == 3,
                    onClick = { onNavigate(tabs[2].route) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = 2.dp)
                .size(AddButtonSize)
                .shadow(
                    elevation = 10.dp,
                    shape = CircleShape,
                    ambientColor = Color.Black.copy(alpha = 0.3f),
                    spotColor = Color.Black.copy(alpha = 0.4f),
                )
                .clip(CircleShape)
                .background(AppColors.Accent)
                .border(1.dp, AppColors.CardBorder, CircleShape)
                .semantics {
                    role = Role.Button
                    contentDescription = addLabel
                }
                .smoothClickable(onClick = onAddClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = null,
                tint = AppColors.OnAccent,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

@Composable
private fun NavIconSlot(
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (isSelected) AppColors.OnBackground else AppColors.OnSurfaceVariant
    val alpha by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0.5f,
        animationSpec = AppSpringSnappy,
        label = "navIconAlpha",
    )

    Box(
        modifier = modifier
            .height(TabRowHeight)
            .semantics {
                role = Role.Tab
                selected = isSelected
                contentDescription = label
            }
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier
                .size(NavIconSize)
                .alpha(alpha),
        )
    }
}
