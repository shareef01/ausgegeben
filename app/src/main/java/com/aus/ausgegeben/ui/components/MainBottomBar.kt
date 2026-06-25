package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.outlined.Settings
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.SurfaceBorderDark
import com.aus.ausgegeben.ui.theme.SurfaceBorderLight

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
        NavItem(Route.ExpenseList, Icons.AutoMirrored.Outlined.ReceiptLong, stringResource(R.string.nav_record)),
        NavItem(Route.CategoryManagement, Icons.Outlined.PieChart, stringResource(R.string.nav_bills)),
        NavItem(Route.Settings, Icons.Outlined.Settings, stringResource(R.string.nav_settings))
    )
    val isDark = isSystemInDarkTheme()
    val glassShape = RoundedCornerShape(AppRadius.xl)
    val glassColor = MaterialTheme.colorScheme.surface.copy(alpha = if (isDark) 0.72f else 0.88f)
    val borderColor = if (isDark) SurfaceBorderDark else SurfaceBorderLight

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 24.dp,
                    shape = glassShape,
                    ambientColor = Color.Black.copy(alpha = 0.35f),
                    spotColor = Color.Black.copy(alpha = 0.2f)
                )
                .clip(glassShape)
                .background(glassColor)
                .border(0.5.dp, borderColor, glassShape)
                .height(60.dp)
                .padding(horizontal = AppSpacing.xs, vertical = AppSpacing.xs),
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
                    modifier = Modifier.weight(1f)
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
    val primary = MaterialTheme.colorScheme.primary
    val tint = if (isSelected) primary else MaterialTheme.colorScheme.onSurfaceVariant
    val tabShape = RoundedCornerShape(AppRadius.md)

    Box(
        modifier = modifier
            .padding(horizontal = 2.dp)
            .clip(tabShape)
            .background(
                if (isSelected) primary.copy(alpha = 0.12f) else Color.Transparent
            )
            .semantics {
                role = Role.Tab
                selected = isSelected
            }
            .smoothClickable(onClick = onClick)
            .padding(vertical = AppSpacing.xs),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            AppIcon(
                imageVector = icon,
                contentDescription = label,
                tint = tint
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = tint,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = AppSpacing.xxs)
            )
        }
    }
}
