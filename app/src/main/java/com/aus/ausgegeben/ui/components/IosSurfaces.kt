package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppDpSpring
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy
import com.aus.ausgegeben.ui.theme.CapsuleShape
import com.aus.ausgegeben.ui.theme.GroupedShape
import com.aus.ausgegeben.ui.theme.SectionLabelStyle
import com.aus.ausgegeben.ui.theme.SurfaceBorderLight

@Composable
fun Modifier.appCard(
    shape: Shape = GroupedShape,
    horizontalPadding: Dp = 0.dp
): Modifier {
    val isDark = isSystemInDarkTheme()
    val surface = if (isDark) AppColors.CardSurface else MaterialTheme.colorScheme.surface
    val borderColor = if (isDark) AppColors.CardBorder else SurfaceBorderLight
    return this
        .then(if (horizontalPadding > 0.dp) Modifier.padding(horizontal = horizontalPadding) else Modifier)
        .clip(shape)
        .background(surface)
        .border(AppElevation.cardBorder, borderColor, shape)
}

@Composable
fun ScreenTitle(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(AppColors.Background)
            .padding(horizontal = AppSpacing.lg)
            .padding(top = AppSpacing.xs, bottom = AppSpacing.sm)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = AppColors.OnBackground,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() }
        )
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = AppColors.OnSurfaceVariant,
                modifier = Modifier.padding(top = AppSpacing.xxs)
            )
        }
    }
}

@Composable
fun GroupedSection(
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = AppSpacing.md,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .appCard(shape = GroupedShape, horizontalPadding = horizontalPadding),
        content = content
    )
}

@Composable
fun GroupedSectionLabel(
    text: String,
    modifier: Modifier = Modifier,
    uppercase: Boolean = true
) {
    Text(
        text = if (uppercase) text.uppercase() else text,
        style = SectionLabelStyle,
        color = AppColors.OnSurfaceVariant,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.lg, vertical = AppSpacing.xs)
    )
}

@Composable
fun IosSeparator(modifier: Modifier = Modifier, insetStart: Dp = 68.dp) {
    HorizontalDivider(
        modifier = modifier.padding(start = insetStart),
        thickness = 1.dp,
        color = AppColors.CardBorder
    )
}

@Composable
fun IosSegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val trackShape = RoundedCornerShape(AppRadius.pill)
    val indicatorShape = RoundedCornerShape(AppRadius.pill)
    val isDark = isSystemInDarkTheme()
    val trackColor = if (isDark) AppColors.Background else MaterialTheme.colorScheme.surfaceVariant
    val innerPadding = 4.dp
    val safeIndex = selectedIndex.coerceIn(0, (options.size - 1).coerceAtLeast(0))

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(40.dp)
            .clip(trackShape)
            .background(trackColor)
            .border(AppElevation.cardBorder, AppColors.CardBorder, trackShape)
            .padding(innerPadding)
    ) {
        val segmentWidth = maxWidth / options.size.coerceAtLeast(1)
        val indicatorOffset by animateDpAsState(
            targetValue = segmentWidth * safeIndex,
            animationSpec = AppDpSpring,
            label = "segmentSlide"
        )

        Box(
            modifier = Modifier
                .offset(x = indicatorOffset)
                .width(segmentWidth)
                .fillMaxHeight()
                .clip(indicatorShape)
                .background(if (isDark) AppColors.CardSurface else MaterialTheme.colorScheme.surface)
                .border(AppElevation.cardBorder, AppColors.CardBorder, indicatorShape)
        )

        Row(modifier = Modifier.fillMaxSize()) {
            options.forEachIndexed { index, label ->
                val selected = safeIndex == index
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .smoothClickable { onSelected(index) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) AppColors.OnBackground else AppColors.OnSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = AppSpacing.xxs)
                    )
                }
            }
        }
    }
}

@Composable
fun Modifier.smoothClickable(
    enabled: Boolean = true,
    onClick: () -> Unit
): Modifier {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = AppSpringSnappy,
        label = "pressScale"
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            onClick = onClick
        )
}

@Composable
fun SmoothIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    tint: Color = AppColors.OnBackground,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CapsuleShape)
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        AppIcon(imageVector = icon, contentDescription = contentDescription, tint = tint)
    }
}
