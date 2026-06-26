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
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppLayoutTokens
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.AppSpringSnappy
import com.aus.ausgegeben.ui.theme.CapsuleShape
import com.aus.ausgegeben.ui.theme.GroupedShape
import com.aus.ausgegeben.ui.theme.SectionLabelStyle
import com.aus.ausgegeben.ui.theme.appBorderColor
import com.aus.ausgegeben.ui.theme.appDividerColor
import com.aus.ausgegeben.ui.theme.brandAccentColor
import com.aus.ausgegeben.ui.theme.navigationInactiveColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle

@Composable
fun Modifier.appCard(
    shape: Shape = GroupedShape,
    horizontalPadding: Dp = 0.dp,
    bordered: Boolean = false,
): Modifier {
    val surface = MaterialTheme.colorScheme.surface
    return this
        .then(if (horizontalPadding > 0.dp) Modifier.padding(horizontal = horizontalPadding) else Modifier)
        .clip(shape)
        .background(surface)
        .then(
            if (bordered) {
                Modifier.border(AppElevation.cardBorder, appBorderColor(), shape)
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
    val accent = brandAccentColor()
    val titleColor = MaterialTheme.colorScheme.onBackground
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md)
            .padding(top = AppSpacing.md, bottom = AppSpacing.sm),
    ) {
        if (title.isNotEmpty()) {
            val signatureTitle = buildAnnotatedString {
                withStyle(
                    SpanStyle(
                        color = accent,
                        fontWeight = FontWeight.Bold,
                        fontSize = MaterialTheme.typography.headlineMedium.fontSize * 1.12f,
                    ),
                ) {
                    append(title.first())
                }
                withStyle(
                    SpanStyle(
                        color = titleColor,
                        fontWeight = FontWeight.SemiBold,
                    ),
                ) {
                    append(title.drop(1))
                }
            }
            Text(
                text = signatureTitle,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
        }
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AppSpacing.xxs),
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
            .appCard(shape = GroupedShape, horizontalPadding = horizontalPadding),
        content = content,
    )
}

@Composable
fun GroupedSectionLabel(
    text: String,
    modifier: Modifier = Modifier,
    uppercase: Boolean = false,
) {
    Text(
        text = if (uppercase) text.uppercase() else text,
        style = SectionLabelStyle,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
    )
}

@Composable
fun IosSeparator(modifier: Modifier = Modifier, insetStart: Dp = AppLayoutTokens.listSeparatorInset) {
    HorizontalDivider(
        modifier = modifier.padding(start = insetStart),
        thickness = AppElevation.cardBorder,
        color = appDividerColor(),
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
    val accent = MaterialTheme.colorScheme.onBackground
    val muted = navigationInactiveColor()
    val containerShape = RoundedCornerShape(AppRadius.pill)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(containerShape)
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))
            .padding(3.dp),
    ) {
        options.forEachIndexed { index, label ->
            val selected = safeIndex == index
            val background by animateColorAsState(
                targetValue = if (selected) {
                    MaterialTheme.colorScheme.surface
                } else {
                    Color.Transparent
                },
                animationSpec = AppColorSpring,
                label = "segmentBackground"
            )
            val contentColor by animateColorAsState(
                targetValue = if (selected) accent else muted,
                animationSpec = AppColorSpring,
                label = "segmentContent"
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
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                    color = contentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
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
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
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

@Composable
fun SmoothIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    tint: Color = MaterialTheme.colorScheme.onBackground,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CapsuleShape)
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        AppIcon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
        )
    }
}
