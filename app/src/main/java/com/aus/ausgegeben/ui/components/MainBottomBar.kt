package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing

private val NavIconSize = 26.dp
private val NavBarContentHeight = 72.dp

private data class NavItem(
    val route: Route,
    val icon: ImageVector,
    val label: String
)

@Composable
fun MainBottomBar(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier
) {
    val items = listOf(
        NavItem(Route.ExpenseList, Icons.AutoMirrored.Rounded.ReceiptLong, stringResource(R.string.nav_record)),
        NavItem(Route.CategoryManagement, Icons.Rounded.PieChart, stringResource(R.string.nav_bills)),
        NavItem(Route.Settings, Icons.Rounded.Settings, stringResource(R.string.nav_settings))
    )
    val barShape = RoundedCornerShape(AppRadius.xl)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.sm, vertical = AppSpacing.xs)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 12.dp,
                    shape = barShape,
                    ambientColor = AppColors.Background.copy(alpha = 0.7f),
                    spotColor = AppColors.Background.copy(alpha = 0.4f)
                )
                .clip(barShape)
                .background(AppColors.CardSurface.copy(alpha = 0.96f))
                .border(1.dp, AppColors.CardBorder, barShape)
                .height(NavBarContentHeight)
                .padding(horizontal = AppSpacing.xxs, vertical = AppSpacing.xxs),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEach { item ->
                val isSelected = when (item.route) {
                    Route.ExpenseList -> currentRoute is Route.ExpenseList
                    Route.CategoryManagement -> currentRoute is Route.CategoryManagement
                    Route.Settings -> currentRoute is Route.Settings
                    else -> false
                }
                NavTab(
                    icon = item.icon,
                    label = item.label,
                    isSelected = isSelected,
                    onClick = { onNavigate(item.route) },
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minWidth = 0.dp)
                )
            }
        }
    }
}

@Composable
private fun NavTab(
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = if (isSelected) AppColors.Expense else AppColors.OnSurfaceVariant
    val tabShape = RoundedCornerShape(AppRadius.md)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(tabShape)
            .background(if (isSelected) accent.copy(alpha = 0.14f) else Color.Transparent)
            .semantics {
                role = Role.Tab
                selected = isSelected
            }
            .smoothClickable(onClick = onClick)
            .padding(vertical = AppSpacing.xs, horizontal = AppSpacing.xxs),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier.size(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(NavIconSize)
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    letterSpacing = 0.sp
                ),
                color = accent,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 2.dp, start = 2.dp, end = 2.dp)
            )
        }
    }
}
