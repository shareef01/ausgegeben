package com.aus.ausgegeben.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy

val MainBottomBarHeight = 68.dp

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
    val destinations = listOf(
        NavDestination(
            route = Route.ExpenseList,
            icon = Icons.AutoMirrored.Rounded.ReceiptLong,
            label = stringResource(R.string.nav_record),
        ),
        NavDestination(
            route = Route.CategoryManagement,
            icon = Icons.Rounded.Analytics,
            label = stringResource(R.string.nav_bills),
        ),
        NavDestination(
            route = Route.Settings,
            icon = Icons.Rounded.Settings,
            label = stringResource(R.string.nav_settings),
        ),
    )

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
                Route.CategoryManagement -> currentRoute is Route.CategoryManagement
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
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1f else 0.94f,
        animationSpec = AppSpringSnappy,
        label = "bottomIconScale"
    )
    val containerColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.onBackground.copy(alpha = 0.09f)
        } else {
            Color.Transparent
        },
        animationSpec = AppColorSpring,
        label = "bottomItemContainer"
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.onBackground
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
        },
        animationSpec = AppColorSpring,
        label = "bottomItemContent"
    )

    Box(
        modifier = modifier
            .height(56.dp)
            .clip(RoundedCornerShape(AppRadius.pill))
            .smoothClickable(onClick = onClick)
            .padding(vertical = AppSpacing.xs),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(50.dp)
                .scale(iconScale)
                .clip(CircleShape)
                .background(containerColor),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = destination.icon,
                contentDescription = destination.label,
                tint = contentColor,
                modifier = Modifier.size(if (selected) 31.dp else 28.dp),
            )
        }
    }
}
