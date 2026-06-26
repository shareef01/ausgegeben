package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing

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
    val recordLabel = stringResource(R.string.nav_record)
    val billsLabel = stringResource(R.string.nav_bills)
    val settingsLabel = stringResource(R.string.nav_settings)
    val destinations = remember(recordLabel, billsLabel, settingsLabel) {
        listOf(
            NavDestination(Route.ExpenseList, Icons.AutoMirrored.Rounded.ReceiptLong, recordLabel),
            NavDestination(Route.CategoryManagement, Icons.Rounded.Analytics, billsLabel),
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
    val containerColor = if (selected) {
        MaterialTheme.colorScheme.onBackground.copy(alpha = 0.09f)
    } else {
        Color.Transparent
    }
    val contentColor = if (selected) {
        MaterialTheme.colorScheme.onBackground
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
    }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .height(56.dp)
            .clip(RoundedCornerShape(AppRadius.pill))
            .clickable(
                interactionSource = interactionSource,
                indication = ripple(bounded = true, radius = 28.dp),
                onClick = onClick,
            )
            .padding(vertical = AppSpacing.xs),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(50.dp)
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
