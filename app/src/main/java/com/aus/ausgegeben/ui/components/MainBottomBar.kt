package com.aus.ausgegeben.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
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
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy

private val NavBarOuterHeight = 68.dp
private val NavBarInnerPadding = 4.dp
private val NavIconSize = 24.dp
private val NavIndicatorShape = RoundedCornerShape(AppRadius.md)

private data class NavItem(
    val route: Route,
    val iconOutlined: ImageVector,
    val iconFilled: ImageVector,
    val label: String,
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
            iconOutlined = Icons.AutoMirrored.Outlined.ReceiptLong,
            iconFilled = Icons.AutoMirrored.Rounded.ReceiptLong,
            label = stringResource(R.string.nav_record),
        ),
        NavItem(
            route = Route.CategoryManagement,
            iconOutlined = Icons.Outlined.Insights,
            iconFilled = Icons.Rounded.Insights,
            label = stringResource(R.string.nav_bills),
        ),
        NavItem(
            route = Route.Settings,
            iconOutlined = Icons.Outlined.Settings,
            iconFilled = Icons.Rounded.Settings,
            label = stringResource(R.string.nav_settings),
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

    val barShape = RoundedCornerShape(AppRadius.pill)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 16.dp,
                    shape = barShape,
                    ambientColor = Color.Black.copy(alpha = 0.45f),
                    spotColor = Color.Black.copy(alpha = 0.25f),
                )
                .clip(barShape)
                .background(AppColors.CardSurface.copy(alpha = 0.94f))
                .border(1.dp, AppColors.CardBorder, barShape)
                .height(NavBarOuterHeight)
                .padding(NavBarInnerPadding),
        ) {
            val tabWidth = maxWidth / items.size
            val indicatorOffset by animateDpAsState(
                targetValue = tabWidth * selectedIndex,
                animationSpec = AppDpSpring,
                label = "navIndicator",
            )

            Box(
                modifier = Modifier
                    .offset(x = indicatorOffset)
                    .width(tabWidth)
                    .fillMaxHeight()
                    .clip(NavIndicatorShape)
                    .background(AppColors.Background)
                    .border(1.dp, AppColors.CardBorder, NavIndicatorShape),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items.forEachIndexed { index, item ->
                    val isSelected = index == selectedIndex
                    NavTab(
                        iconOutlined = item.iconOutlined,
                        iconFilled = item.iconFilled,
                        label = item.label,
                        isSelected = isSelected,
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
    iconOutlined: ImageVector,
    iconFilled: ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentColor = if (isSelected) AppColors.OnBackground else AppColors.OnSurfaceVariant
    val iconScale by animateFloatAsState(
        targetValue = if (isSelected) 1.08f else 1f,
        animationSpec = AppSpringSnappy,
        label = "navIconScale",
    )
    val labelAlpha by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0.82f,
        animationSpec = AppSpringSnappy,
        label = "navLabelAlpha",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                role = Role.Tab
                selected = isSelected
            }
            .smoothClickable(onClick = onClick)
            .padding(vertical = 6.dp, horizontal = AppSpacing.xxs),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier.size(30.dp),
                contentAlignment = Alignment.Center,
            ) {
                AnimatedContent(
                    targetState = isSelected,
                    transitionSpec = {
                        (fadeIn(AppSpringSnappy) + scaleIn(initialScale = 0.88f, animationSpec = AppSpringSnappy))
                            .togetherWith(
                                fadeOut(AppSpringSnappy) + scaleOut(targetScale = 0.88f, animationSpec = AppSpringSnappy)
                            )
                    },
                    label = "navIcon",
                ) { selected ->
                    Icon(
                        imageVector = if (selected) iconFilled else iconOutlined,
                        contentDescription = null,
                        tint = contentColor,
                        modifier = Modifier
                            .size(NavIconSize)
                            .scale(iconScale),
                    )
                }
            }

            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    letterSpacing = 0.2.sp,
                ),
                color = contentColor.copy(alpha = labelAlpha),
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 1.dp, start = 2.dp, end = 2.dp),
            )
        }
    }
}
