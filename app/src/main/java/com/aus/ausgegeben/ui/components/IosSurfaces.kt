package com.aus.ausgegeben.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.rememberAppHaptics

/**
 * Pillar 2: Premium glassmorphic surface with specular depth highlights.
 * ENHANCED: Multi-layered border and inner specular glow for "Hyper-Obsidian" depth.
 */
@Composable
fun Modifier.appGlassCard(
    shape: Shape = RoundedCornerShape(AppRadius.card),
    bordered: Boolean = true,
): Modifier {
    val isDark = isAppDarkTheme()
    return this
        .clip(shape)
        .background(appGlassBase())
        .then(
            if (bordered) {
                Modifier
                    // Outer structural border
                    .border(0.5.dp, appSpecularBorder(), shape)
                    // Inner specular highlight (top-left)
                    .drawWithContent {
                        drawContent()
                        val color = if (isDark) Color.White.copy(alpha = 0.03f) else Color.White.copy(alpha = 0.4f)
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(color, Color.Transparent),
                                center = Offset(0f, 0f),
                                radius = size.minDimension
                            )
                        )
                    }
            } else {
                Modifier
            },
        )
}

/** Legacy support for appCard */
@Composable
fun Modifier.appCard(
    shape: Shape = RoundedCornerShape(AppRadius.card),
    horizontalPadding: Dp = 0.dp,
    bordered: Boolean = true,
): Modifier = this.then(if (horizontalPadding > 0.dp) Modifier.padding(horizontal = horizontalPadding) else Modifier).appGlassCard(shape, bordered)

/**
 * Dynamic Glass Shine effect for high-interactive elements.
 */
@Composable
fun Modifier.glassShine(enabled: Boolean = true): Modifier {
    if (!enabled) return this
    val infiniteTransition = rememberInfiniteTransition(label = "shine")
    val shineProgress by infiniteTransition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shineProgress"
    )

    return this.drawWithContent {
        drawContent()
        val shineWidth = size.width / 1.5f
        val x = (size.width + shineWidth) * shineProgress - shineWidth
        drawRect(
            brush = Brush.linearGradient(
                colors = listOf(
                    Color.Transparent,
                    Color.White.copy(alpha = 0.04f),
                    Color.White.copy(alpha = 0.08f),
                    Color.White.copy(alpha = 0.04f),
                    Color.Transparent
                ),
                start = Offset(x, 0f),
                end = Offset(x + shineWidth, size.height)
            ),
            size = size
        )
    }
}

@Composable
fun SignatureText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    accentColor: Color = MaterialTheme.colorScheme.primary,
    textColor: Color = Color.Unspecified
) {
    if (text.isBlank()) return
    
    val annotatedString = remember(text, accentColor, textColor) {
        val lower = text.lowercase()
        buildAnnotatedString {
            withStyle(style = SpanStyle(color = accentColor, fontWeight = FontWeight.Bold)) {
                append(lower.take(1))
            }
            val resolvedTextColor = if (textColor == Color.Unspecified) Color.Unspecified else textColor
            withStyle(style = SpanStyle(color = resolvedTextColor)) {
                append(lower.drop(1))
            }
        }
    }

    Text(
        text = annotatedString,
        style = style,
        color = if (textColor == Color.Unspecified) MaterialTheme.colorScheme.onSurface else textColor,
        modifier = modifier
    )
}

@Composable
fun ScreenTitle(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md)
            .padding(top = 16.dp, bottom = AppSpacing.md),
    ) {
        if (action != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    SignatureText(
                        text = title,
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.semantics { heading() },
                    )
                    if (subtitle != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = subtitle.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = readableSecondaryColor(),
                            modifier = Modifier.padding(top = AppSpacing.xs),
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                action()
            }
        } else {
            SignatureText(
                text = title,
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.semantics { heading() },
            )
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = subtitle.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = readableSecondaryColor(),
                    modifier = Modifier.padding(top = AppSpacing.xs),
                )
            }
        }
    }
}

@Composable
fun GroupedSectionLabel(
    text: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.lg)
            .padding(top = 24.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Structural Anchor
        Box(
            modifier = Modifier
                .width(2.dp)
                .height(12.dp)
                .background(financeIncomeColor(), RoundedCornerShape(50))
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = text.lowercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                color = readableSecondaryColor(),
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp
            )
        )
    }
}

@Composable
fun IosSeparator(modifier: Modifier = Modifier, insetStart: Dp = 0.dp) {
    HorizontalDivider(
        modifier = modifier.padding(start = insetStart),
        thickness = 1.dp,
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
    val containerShape = RoundedCornerShape(AppRadius.pill)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(containerShape)
            .background(if (isAppDarkTheme()) Color(0xFF09090B) else Color(0xFFF1F1F4))
            .border(0.5.dp, Color.White.copy(alpha = 0.05f), containerShape)
            .padding(2.dp)
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val pillWidth = maxWidth / options.size
            val pillOffset by animateDpAsState(
                targetValue = pillWidth * safeIndex,
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioNoBouncy),
                label = "pillOffset"
            )

            Box(
                modifier = Modifier
                    .offset(x = pillOffset)
                    .width(pillWidth)
                    .fillMaxHeight()
                    .padding(2.dp)
                    .shadow(
                        elevation = 4.dp,
                        shape = RoundedCornerShape(12.dp),
                        spotColor = Color.Black,
                        ambientColor = Color.Black.copy(alpha = 0.5f)
                    )
                    .background(if (isAppDarkTheme()) Color(0xFF1C1C20) else Color.White, RoundedCornerShape(12.dp))
            )
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, label ->
                val selected = safeIndex == index
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(containerShape)
                        .smoothClickable { onSelected(index) }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label.lowercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        color = if (selected) MaterialTheme.colorScheme.onSurface else readableSecondaryColor(),
                        maxLines = 1,
                        textAlign = TextAlign.Center,
                    )
                }
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
        targetValue = if (pressed) 0.98f else 1f,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppDatePickerSheet(
    initialSelectedDateMillis: Long?,
    title: String,
    onDismiss: () -> Unit,
    onConfirm: (Long) -> Unit,
) {
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialSelectedDateMillis)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SheetHeader(
                title = title,
                bottomSpacing = 8.dp,
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp)
                    .clip(RoundedCornerShape(AppRadius.card))
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                DatePicker(
                    state = datePickerState,
                    showModeToggle = false,
                    title = null,
                    headline = null,
                )
            }
            Spacer(Modifier.height(24.dp))
            SheetConfirmActions(
                onDismiss = onDismiss,
                onConfirm = {
                    datePickerState.selectedDateMillis?.let { onConfirm(it) }
                },
                confirmLabel = stringResource(R.string.action_ok),
            )
        }
    }
}

/** Shared drag handle for modal bottom sheets */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppSheetDragHandle() {
    BottomSheetDefaults.DragHandle(color = appDividerColor())
}

/** Shared title block for modal bottom sheets. */
@Composable
fun SheetHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    lowercaseTitle: Boolean = true,
    bottomSpacing: Dp = 0.dp,
) {
    Column(
        modifier = modifier
            .fillMaxWidth(),
    ) {
        if (lowercaseTitle) {
            SignatureText(
                text = title,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.semantics { heading() }
            )
        } else {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.semantics { heading() }
            )
        }
        if (subtitle != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = readableSecondaryColor(),
                modifier = Modifier.padding(top = AppSpacing.xs),
            )
        }
        if (bottomSpacing > 0.dp) {
            Spacer(Modifier.height(bottomSpacing))
        }
    }
}

@Composable
fun SheetConfirmActions(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmLabel: String,
    dismissLabel: String = stringResource(R.string.action_cancel),
    confirmEnabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberAppHaptics()
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppOutlinedButton(
            onClick = {
                haptics.light()
                onDismiss()
            },
            modifier = Modifier.weight(1f),
        ) {
            Text(dismissLabel.lowercase())
        }
        AppButton(
            onClick = {
                haptics.success()
                onConfirm()
            },
            enabled = confirmEnabled,
            modifier = Modifier.weight(1f),
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
        ) {
            Text(confirmLabel.lowercase())
        }
    }
}

@Composable
fun SheetDismissButton(
    onClick: () -> Unit,
    label: String = stringResource(R.string.action_close),
    modifier: Modifier = Modifier,
) {
    val haptics = rememberAppHaptics()
    AppOutlinedButton(
        onClick = {
            haptics.light()
            onClick()
        },
        modifier = modifier.fillMaxWidth(),
    ) {
        Text(label)
    }
}
