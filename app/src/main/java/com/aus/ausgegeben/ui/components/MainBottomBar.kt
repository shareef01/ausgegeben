package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppColors

/** Standard Material navigation bar content height. */
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

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(AppColors.CardSurface),
    ) {
        HorizontalDivider(color = AppColors.CardBorder, thickness = 1.dp)
        NavigationBar(
            modifier = Modifier.fillMaxWidth(),
            containerColor = AppColors.CardSurface,
            tonalElevation = 0.dp,
            contentColor = AppColors.OnBackground,
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
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = AppColors.OnBackground,
                        selectedTextColor = AppColors.OnBackground,
                        unselectedIconColor = AppColors.OnSurfaceVariant,
                        unselectedTextColor = AppColors.OnSurfaceVariant,
                        indicatorColor = AppColors.NumpadPress,
                    ),
                )
            }
        }
    }
}
