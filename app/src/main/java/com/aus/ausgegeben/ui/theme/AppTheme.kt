package com.aus.ausgegeben.ui.theme

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle

/** Whether the active Material color scheme is a dark theme. */
@Composable
fun isAppDarkTheme(): Boolean =
    MaterialTheme.colorScheme.background.luminance() < 0.5f

@Composable
fun appBorderColor(): Color =
    if (isAppDarkTheme()) AppColors.CardBorder else SurfaceBorderLight

@Composable
fun appDividerColor(): Color =
    if (isAppDarkTheme()) AppColors.CardBorder else OutlineLight.copy(alpha = 0.6f)

/** Secondary labels, timestamps — tuned per theme for readable contrast */
@Composable
fun readableSecondaryColor(): Color =
    if (isAppDarkTheme()) Color(0xFFA1A1AA) else Color(0xFF6B6B75)

/** Bottom nav / tabs — inactive but still readable */
@Composable
fun navigationInactiveColor(): Color =
    MaterialTheme.colorScheme.onSurfaceVariant.copy(
        alpha = if (isAppDarkTheme()) 0.72f else 0.72f,
    )

/** Decorative tints for grouped settings rows — theme-aware, not hardcoded hex */
@Composable
fun settingsIconTintAccent(): Color = MaterialTheme.colorScheme.tertiary

@Composable
fun settingsIconTintMuted(): Color = readableSecondaryColor()

@Composable
fun settingsDestructiveColor(): Color = MaterialTheme.colorScheme.error

@Composable
fun financeIncomeColor(): Color {
    if (!isAppDarkTheme()) return IncomeGreenLight
    val primary = MaterialTheme.colorScheme.primary
    return if (primary.luminance() > 0.82f) IncomeGreen else primary
}

@Composable
fun financeExpenseColor(): Color = MaterialTheme.colorScheme.error

@Composable
fun financeTransferColor(): Color =
    if (isAppDarkTheme()) readableSecondaryColor() else TransferGrayLight

@Composable
fun inputFocusedBorderColor(): Color =
    if (isAppDarkTheme()) FocusRing else MaterialTheme.colorScheme.primary

@Composable
fun inputUnfocusedBorderColor(): Color = MaterialTheme.colorScheme.outline

/** Subtle glass card fill used on summary / auth / bills surfaces */
@Composable
fun appGlassBase(): Color =
    if (isAppDarkTheme()) Color.White.copy(alpha = 0.03f) else Color.Black.copy(alpha = 0.03f)

/**
 * Opaque elevated surface for dialogs / popovers that float above content.
 */
@Composable
fun appElevatedSurface(): Color {
    val scheme = MaterialTheme.colorScheme
    return if (isAppDarkTheme()) {
        Color.White.copy(alpha = 0.06f).compositeOver(scheme.surface)
    } else {
        scheme.surface
    }
}

/** Modal bottom sheets — match screen background for seamless lift */
@Composable
fun appSheetContainerColor(): Color = MaterialTheme.colorScheme.background

/** Consistent dim behind modal sheets */
@Composable
fun appSheetScrimColor(): Color =
    Color.Black.copy(alpha = if (isAppDarkTheme()) 0.55f else 0.45f)

/** Shared outlined field styling for auth, settings, and record search */
@Composable
fun appTextFieldColors(accent: Color = MaterialTheme.colorScheme.primary): TextFieldColors =
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = accent.copy(alpha = 0.55f),
        unfocusedBorderColor = appBorderColor().copy(alpha = 0.45f),
        disabledBorderColor = appBorderColor().copy(alpha = 0.25f),
        focusedContainerColor = appGlassBase(),
        unfocusedContainerColor = appGlassBase(),
        disabledContainerColor = appGlassBase(),
        cursorColor = accent,
        focusedLabelColor = accent,
        unfocusedLabelColor = readableSecondaryColor(),
        disabledLabelColor = readableSecondaryColor().copy(alpha = 0.5f),
        focusedLeadingIconColor = accent,
        unfocusedLeadingIconColor = navigationInactiveColor(),
        disabledLeadingIconColor = navigationInactiveColor().copy(alpha = 0.4f),
        focusedTrailingIconColor = accent,
        unfocusedTrailingIconColor = navigationInactiveColor(),
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedPlaceholderColor = readableSecondaryColor().copy(alpha = 0.7f),
    )

/**
 * Readable foreground on arbitrary filled button/chip backgrounds.
 * Chosen purely from the fill's luminance so it stays correct regardless of theme
 */
@Composable
fun contrastColorOn(fill: Color): Color =
    if (fill.luminance() > 0.55f) Color(0xFF09090B) else Color.White

/** Specular edge highlight for glass cards */
@Composable
fun appSpecularBorder(): Brush = if (isAppDarkTheme()) {
    Brush.linearGradient(
        colors = listOf(Color.White.copy(alpha = 0.18f), Color.Transparent),
        start = Offset.Zero,
        end = Offset(160f, 160f),
    )
} else {
    Brush.linearGradient(
        colors = listOf(Color.Black.copy(alpha = 0.1f), Color.Transparent),
        start = Offset.Zero,
        end = Offset(160f, 160f),
    )
}

/** Unified section label style with theme-aware secondary color */
@Composable
fun sectionLabelStyle(): TextStyle = SectionLabelStyle.copy(color = readableSecondaryColor())
object AppAurora {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun brush(
        color: Color = MaterialTheme.colorScheme.primary,
        opacity: Float = if (isAppDarkTheme()) 0.12f else 0.08f,
        radius: Float = 1400f,
        center: Offset = Offset(0f, 0f),
    ): Brush {
        // Law 5: Motion Drift - Infinite subtle movement of background glows
        val transition = rememberInfiniteTransition(label = "auroraDrift")
        
        val driftX by transition.animateFloat(
            initialValue = -120f,
            targetValue = 120f,
            animationSpec = infiniteRepeatable(
                animation = tween(22000, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "driftX"
        )
        
        val driftY by transition.animateFloat(
            initialValue = -80f,
            targetValue = 80f,
            animationSpec = infiniteRepeatable(
                animation = tween(28000, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "driftY"
        )

        return Brush.radialGradient(
            colors = listOf(
                color.copy(alpha = opacity),
                color.copy(alpha = opacity * 0.4f),
                Color.Transparent
            ),
            radius = radius,
            center = Offset(center.x + driftX, center.y + driftY)
        )
    }
}
