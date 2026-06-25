package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
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
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy

/** Visible tab row height (divider + gesture inset are added by the scaffold wrapper). */
val MainBottomBarHeight = 56.dp

private val NavIconSize = 26.dp
private val NavIndicatorWidth = 28.dp
private val NavIndicatorHeight = 3.dp

private data class NavItem(
    val route: Route,
    val icon: ImageVector,
    val label: String,
    val selectedTint: Color,
)

@Composable
fun MainBottomBar(
    currentRoute: Route?,
    onNavigate: (Route) -> Unit,
    modifier: Modifier = Modifier,
) {
    val items = listOf(
        NavItem(
            route = Route.ExpenseList,
            icon = Icons.AutoMirrored.Rounded.ReceiptLong,
            label = stringResource(R.string.nav_record),
            selectedTint = AppColors.OnBackground,
        ),
        NavItem(
            route = Route.CategoryManagement,
            icon = Icons.Rounded.BarChart,
            label = stringResource(R.string.nav_bills),
            selectedTint = AppColors.Income,
        ),
        NavItem(
            route = Route.Settings,
            icon = Icons.Rounded.Tune,
            label = stringResource(R.string.nav_settings),
            selectedTint = AppColors.OnBackground,
        ),
    )

    val selectedIndex = items.indexOfFirst { item ->
        when (item.route) {
            Route.ExpenseList -> currentRoute is Route.ExpenseList
            Route.CategoryManagement -> currentRoute is Route.CategoryManagement
            Route.Settings -> currentRoute is Route.Settings
            else -> false
        }
    }.coerceAtLeast(0)

    Column(modifier = modifier.fillMaxWidth()) {
        HorizontalDivider(color = AppColors.CardBorder, thickness = 1.dp)

        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(MainBottomBarHeight)
                .background(AppColors.CardSurface),
        ) {
            val tabWidth = maxWidth / items.size
            val indicatorOffset by animateDpAsState(
                targetValue = tabWidth * selectedIndex + (tabWidth - NavIndicatorWidth) / 2,
                animationSpec = AppDpSpring,
                label = "navIndicator",
            )

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .offset(x = indicatorOffset, y = (-6).dp)
                    .width(NavIndicatorWidth)
                    .height(NavIndicatorHeight)
                    .background(
                        color = items[selectedIndex].selectedTint,
                        shape = RoundedCornerShape(NavIndicatorHeight / 2),
                    ),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items.forEachIndexed { index, item ->
                    NavTab(
                        icon = item.icon,
                        label = item.label,
                        isSelected = index == selectedIndex,
                        selectedTint = item.selectedTint,
                        onClick = { onNavigate(item.route) },
                        modifier = Modifier
                            .weight(1f)
                            .defaultMinSize(minWidth = 0.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun NavTab(
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    selectedTint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (isSelected) selectedTint else AppColors.OnSurfaceVariant
    val iconAlpha by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0.55f,
        animationSpec = AppSpringSnappy,
        label = "navIconAlpha",
    )
    val labelAlpha by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0.65f,
        animationSpec = AppSpringSnappy,
        label = "navLabelAlpha",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MainBottomBarHeight)
            .semantics {
                role = Role.Tab
                selected = isSelected
            }
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = AppSpacing.xxs),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = tint,
                modifier = Modifier
                    .size(NavIconSize)
                    .alpha(iconAlpha),
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                ),
                color = tint.copy(alpha = labelAlpha),
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
    }
}
