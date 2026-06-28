package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// ── DESIGN TOKENS ───────────────────────────────────────────────────────────
object AppColors {
    /** Absolute Base Layer: Pure emissive OLED black */
    val Background = Color(0xFF000000)

    /** Primary Material Island — Deep obsidian */
    val CardSurface = Color(0xFF09090B)
    
    /** Secondary Material — Inner blocks */
    val InnerSurface = Color(0xFF121214)

    /** Micro-Border: Ultra-thin hairline stroke (7% White) */
    val CardBorder = Color(0x12FFFFFF)

    /** High-voltage active accents */
    val Expense = Color(0xFFFB7185) // Clean Coral
    val Income = Color(0xFF10B981)  // Pure Emerald
    val Transfer = Color(0xFF94A3B8)

    val Accent = Color(0xFFFFFFFF)
    val OnAccent = Color(0xFF000000)

    /** Interactive Layer States */
    val NumpadPress = Color(0x1AFFFFFF)
    val DisabledSurface = Color(0xFF18181B)
    val DisabledContent = Color(0xFF3F3F46)

    val OnBackground = Color(0xFFFFFFFF)
    /** Metadata / Secondary Labels: Muted Slate */
    val OnSurfaceVariant = Color(0xFF71717A)
}

// ── Palette aliases ───────────────────────────────────────────────────────────
val BackgroundDark = AppColors.Background
val SurfaceDark = AppColors.CardSurface
val InnerSurfaceDark = AppColors.InnerSurface
val SurfaceBorderDark = AppColors.CardBorder

val AccentCoral = AppColors.Expense
val IncomeGreen = AppColors.Income
val TransferGray = AppColors.Transfer

val OnBackgroundDark = AppColors.OnBackground
val OnSurfaceDark = Color(0xFFFFFFFF)
val OnSurfaceVariantDark = AppColors.OnSurfaceVariant

val BackgroundLight = Color(0xFFFAFAFA)
val SurfaceLight = Color(0xFFFFFFFF)
val SurfaceVariantLight = Color(0xFFF4F4F5)
val OutlineLight = Color(0xFFE4E4E7)
val SurfaceBorderLight = Color(0xFFE5E5E7)
val OnBackgroundLight = Color(0xFF09090B)
val OnSurfaceLight = Color(0xFF09090B)
val OnSurfaceVariantLight = Color(0xFF52525B)

val IncomeGreenLight = Color(0xFF157A3A)
val TransferGrayLight = Color(0xFF52525B)
val SystemViolet = Color(0xFF8B5CF6)

val FocusRing = Color(0xFF3B82F6)
val ChartStrokeWidth = 6.dp
