package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route

val MainBottomBarHeight = 64.dp

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

    NavigationBar(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background),
        containerColor = MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp,
        contentColor = MaterialTheme.colorScheme.onSurface,
    ) {
        destinations.forEach { destination ->
            val selected = when (destination.route) {
                Route.ExpenseList -> currentRoute is Route.ExpenseList
                Route.CategoryManagement -> currentRoute is Route.CategoryManagement
                Route.Settings -> currentRoute is Route.Settings
                else -> false
            }
            NavigationBarItem(
                selected = selected,
                onClick = { onNavigate(destination.route) },
                icon = {
                    Icon(
                        imageVector = destination.icon,
                        contentDescription = destination.label,
                    )
                },
                label = {
                    Text(
                        text = destination.label,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onBackground,
                    selectedTextColor = MaterialTheme.colorScheme.onBackground,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                    indicatorColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f),
                ),
            )
        }
    }
}
