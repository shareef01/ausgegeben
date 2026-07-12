package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy
import com.aus.ausgegeben.ui.theme.CapsuleShape

@Composable
fun Modifier.appCard(
    shape: Shape = RoundedCornerShape(AppRadius.card),
    horizontalPadding: Dp = 0.dp,
    bordered: Boolean = true,
): Modifier {
    val surface = MaterialTheme.colorScheme.surface
    val borderColor = MaterialTheme.colorScheme.outlineVariant
    val isDark = MaterialTheme.colorScheme.background.luminance() < 0.5f

    // Pillar 2: Raw glassmorphic surface with subtle depth — not stock M3 Surface
    val glassBase = if (isDark) {
        Color(0xFFFFFFFF).copy(alpha = 0.04f)
    } else {
        Color(0xFF000000).copy(alpha = 0.02f)
    }

    return this
        .then(if (horizontalPadding > 0.dp) Modifier.padding(horizontal = horizontalPadding) else Modifier)
        .clip(shape)
        .background(glassBase)
        .then(
            if (bordered) {
                Modifier.border(1.dp, borderColor.copy(alpha = 0.55f), shape)
            } else {
                Modifier
            },
        )
}

@Composable
fun ScreenTitle(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md)
            .padding(top = 16.dp, bottom = AppSpacing.md),
    ) {
        Text(
            text = title.lowercase(), // Law: All small letters
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        if (subtitle != null) {
            Text(
                text = subtitle.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AppSpacing.xs),
            )
        }
    }
}

@Composable
fun GroupedSection(
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = AppSpacing.md,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .appCard(shape = RoundedCornerShape(AppRadius.card), horizontalPadding = horizontalPadding),
        content = content,
    )
}

@Composable
fun GroupedSectionLabel(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
    )
}

@Composable
fun IosSeparator(modifier: Modifier = Modifier, insetStart: Dp = 0.dp) {
    HorizontalDivider(
        modifier = modifier.padding(start = insetStart),
        thickness = 1.dp,
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
    )
}

@Composable
fun IosSegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val safeIndex = selectedIndex.coerceIn(0, (options.size - 1).coerceAtLeast(0))
    val containerShape = RoundedCornerShape(AppRadius.pill)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(containerShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp),
    ) {
        options.forEachIndexed { index, label ->
            val selected = safeIndex == index
            val background by animateColorAsState(
                targetValue = if (selected) {
                    MaterialTheme.colorScheme.background
                } else {
                    Color.Transparent
                },
                animationSpec = AppColorSpring,
                label = "segmentBackground"
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(containerShape)
                    .background(background)
                    .smoothClickable { onSelected(index) }
                    .padding(vertical = AppSpacing.xs),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    color = if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
fun Modifier.smoothClickable(
    enabled: Boolean = true,
    onClick: () -> Unit,
): Modifier {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current

    LaunchedEffect(pressed) {
        if (pressed && enabled) {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = AppSpringSnappy,
        label = "pressScale",
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            onClick = onClick,
        )
}
