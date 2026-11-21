package com.aus.ausgegeben.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.navigationInactiveColor

val MainBottomBarHeight = 64.dp

private data class NavDestination(
    val route: Route,
    val icon: ImageVector,
    val label: String,
)

/**
 * The bottom bar plus a filler as tall as the system navigation bar, so the tabs sit above
 * the gesture handle or the 3-button bar and nothing shows through beneath them.
 */
@Composable
fun MainBottomNavigation(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background),
    ) {
        MainBottomBar(currentRoute = currentRoute, onNavigate = onNavigate)
        Spacer(
            Modifier
                .fillMaxWidth()
                .windowInsetsBottomHeight(WindowInsets.navigationBars)
                .background(MaterialTheme.colorScheme.background),
        )
    }
}

@Composable
private fun rememberMainNavDestinations(): List<NavDestination> {
    val recordLabel = stringResource(R.string.nav_record)
    val insightsLabel = stringResource(R.string.nav_bills)
    val settingsLabel = stringResource(R.string.nav_settings)
    return remember(recordLabel, insightsLabel, settingsLabel) {
        listOf(
            NavDestination(Route.ExpenseList, Icons.AutoMirrored.Rounded.List, recordLabel),
            NavDestination(Route.Insights, Icons.Rounded.Analytics, insightsLabel),
            NavDestination(Route.Settings, Icons.Rounded.Settings, settingsLabel),
        )
    }
}

private fun NavDestination.isSelected(currentRoute: Route?): Boolean = when (route) {
    Route.ExpenseList -> currentRoute is Route.ExpenseList
    Route.Insights -> currentRoute is Route.Insights
    Route.Settings -> currentRoute is Route.Settings
    else -> false
}

@Composable
fun MainBottomBar(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier,
) {
    val destinations = rememberMainNavDestinations()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(MainBottomBarHeight)
            .background(MaterialTheme.colorScheme.background)
            .selectableGroup()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        destinations.forEach { destination ->
            MainBottomBarItem(
                destination = destination,
                selected = destination.isSelected(currentRoute),
                onClick = { onNavigate(destination.route) },
                modifier = Modifier.weight(1f).height(52.dp),
            )
        }
    }
}

/**
 * The side rail used instead of the bottom bar when the window is at least 600dp wide
 * (tablets, unfolded foldables, landscape phones). Same items, order, semantics and
 * styling as [MainBottomBar], stacked vertically and pinned to the top like a Material 3
 * navigation rail. It pads itself for the status bar and for a navigation bar or display
 * cutout on its side, so the caller only places it.
 */
@Composable
fun MainNavigationRail(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier,
) {
    val destinations = rememberMainNavDestinations()

    Column(
        modifier = modifier
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(
                WindowInsets.systemBars
                    .union(WindowInsets.displayCutout)
                    .only(WindowInsetsSides.Start + WindowInsetsSides.Vertical),
            )
            .width(80.dp)
            .selectableGroup()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = AppSpacing.sm, vertical = AppSpacing.md),
        verticalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        destinations.forEach { destination ->
            MainBottomBarItem(
                destination = destination,
                selected = destination.isSelected(currentRoute),
                onClick = { onNavigate(destination.route) },
                modifier = Modifier.fillMaxWidth().height(56.dp),
            )
        }
    }
}

@Composable
private fun MainBottomBarItem(
    destination: NavDestination,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val containerColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.onBackground.copy(alpha = 0.09f)
        } else {
            Color.Transparent
        },
        animationSpec = AppColorSpring,
        label = "navItemBg",
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.onBackground
        } else {
            navigationInactiveColor()
        },
        animationSpec = AppColorSpring,
        label = "navItemTint",
    )
    val iconSize by animateDpAsState(
        targetValue = if (selected) 26.dp else 24.dp,
        animationSpec = AppDpSpring,
        label = "navIconSize",
    )
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(AppRadius.pill))
            .background(containerColor)
            .semantics {
                role = Role.Tab
                contentDescription = destination.label
                this.selected = selected
            }
            .clickable(
                interactionSource = interactionSource,
                indication = ripple(bounded = true),
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = destination.icon,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.size(iconSize),
        )
    }
}
