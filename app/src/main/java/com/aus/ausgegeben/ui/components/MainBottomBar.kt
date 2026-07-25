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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.navigationInactiveColor

val MainBottomBarHeight = 72.dp

private data class NavDestination(
    val route: Route,
    val icon: ImageVector,
    val label: String,
)

@Composable
fun MainBottomBar(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier,
) {
    val recordLabel = stringResource(R.string.nav_record)
    val insightsLabel = stringResource(R.string.nav_bills)
    val settingsLabel = stringResource(R.string.nav_settings)
    val destinations = remember(recordLabel, insightsLabel, settingsLabel) {
        listOf(
            NavDestination(Route.ExpenseList, Icons.AutoMirrored.Rounded.List, recordLabel),
            NavDestination(Route.Insights, Icons.Rounded.Analytics, insightsLabel),
            NavDestination(Route.Settings, Icons.Rounded.Settings, settingsLabel),
        )
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(MainBottomBarHeight)
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        destinations.forEach { destination ->
            val selected = when (destination.route) {
                Route.ExpenseList -> currentRoute is Route.ExpenseList
                Route.Insights -> currentRoute is Route.Insights
                Route.Settings -> currentRoute is Route.Settings
                else -> false
            }
            MainBottomBarItem(
                destination = destination,
                selected = selected,
                onClick = { onNavigate(destination.route) },
                modifier = Modifier.weight(1f),
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
        targetValue = if (selected) 24.dp else 22.dp,
        animationSpec = AppDpSpring,
        label = "navIconSize",
    )
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .height(60.dp)
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
            )
            .padding(horizontal = 4.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = destination.icon,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.size(iconSize),
        )
        Text(
            text = destination.label.lowercase(),
            color = contentColor,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
