package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.ui.theme.AppSpringSnappy

private data class NavItem(
    val route: Route,
    val icon: ImageVector,
    val contentDescription: String
)

@Composable
fun FloatingBottomNav(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier
) {
    val items = listOf(
        NavItem(Route.ExpenseList, Icons.AutoMirrored.Rounded.ReceiptLong, stringResource(R.string.nav_record)),
        NavItem(Route.CategoryManagement, Icons.Rounded.PieChart, stringResource(R.string.nav_bills)),
        NavItem(Route.Settings, Icons.Rounded.Settings, stringResource(R.string.nav_settings))
    )
    val selectedIndex = items.indexOfFirst { item ->
        when (item.route) {
            Route.ExpenseList -> currentRoute is Route.ExpenseList
            Route.CategoryManagement -> currentRoute is Route.CategoryManagement
            Route.Settings -> currentRoute is Route.Settings
            else -> false
        }
    }.coerceAtLeast(0)

    val animatedIndex by animateFloatAsState(
        targetValue = selectedIndex.toFloat(),
        animationSpec = AppSpringSnappy,
        label = "navIndicator"
    )

    Box(modifier = modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 40.dp, vertical = 10.dp),
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
            shadowElevation = 12.dp,
            tonalElevation = 4.dp
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .padding(horizontal = 8.dp)
            ) {
                val density = LocalDensity.current
                val itemWidth = maxWidth / items.size
                val indicatorOffset = with(density) {
                    (animatedIndex * itemWidth.toPx()).toDp()
                }

                Box(
                    modifier = Modifier
                        .offset(x = indicatorOffset)
                        .width(itemWidth)
                        .fillMaxHeight()
                        .padding(vertical = 6.dp, horizontal = 4.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                AccentCoral.copy(alpha = 0.18f),
                                AccentCoral.copy(alpha = 0.08f)
                            )
                        )
                        )
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    items.forEachIndexed { index, item ->
                        val selected = index == selectedIndex
                        NavIcon(
                            icon = item.icon,
                            contentDescription = item.contentDescription,
                            isSelected = selected,
                            onClick = { onNavigate(item.route) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NavIcon(
    icon: ImageVector,
    contentDescription: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val tint = if (isSelected) AccentCoral else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = Modifier
            .size(52.dp)
            .semantics {
                role = Role.Tab
                selected = isSelected
            }
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(if (isSelected) 27.dp else 25.dp)
        )
    }
}
