package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// ── DESIGN TOKENS ───────────────────────────────────────────────────────────
object AppColors {
    /** Primary app background — rich slate, not pure black */
    val Background = PremiumPalette.Slate950

    /** Elevated card surface */
    val CardSurface = PremiumPalette.Slate900

    /** Hairline separators / glass borders */
    val CardBorder = PremiumPalette.GlassBorder

    /** Expenses — accessible rose on dark slate */
    val Expense = PremiumPalette.Expense

    /** Income — accessible emerald on dark slate */
    val Income = PremiumPalette.Income

    /** Primary CTA / FAB accent */
    val Accent = PremiumPalette.Accent

    val OnAccent = PremiumPalette.OnAccent

    val NumpadPress = Color(0x1AFFFFFF)

    val OnBackground = PremiumPalette.Slate50
    val OnSurfaceVariant = PremiumPalette.Slate400
    val Transfer = PremiumPalette.Slate500
}

// ── Palette aliases ───────────────────────────────────────────────────────────
val BackgroundDark = AppColors.Background
val BackgroundElevated = Color(0xFF162032)
val BackgroundGlowWarm = Color(0xFF141A28)
val BackgroundGlowCool = Color(0xFF101828)
val BackgroundGlowMint = Color(0xFF0F1F1C)

val SurfaceDark = AppColors.CardSurface
val SurfaceElevatedDark = Color(0xFF243044)
val SurfaceVariantDark = PremiumPalette.Slate800
val TertiarySurfaceDark = Color(0xFF2D3B50)
val OutlineDark = PremiumPalette.Slate700
val OutlineVariantDark = PremiumPalette.Slate800
val SeparatorDark = PremiumPalette.Slate700
val GlassOverlayDark = Color(0xE60F172A)

val AccentCoral = AppColors.Expense
val AccentCoralSoft = Color(0xFFFECDD3)
val AccentRed = AppColors.Expense

val IncomeGreen = AppColors.Income
val IncomeGreenSoft = Color(0xFFA7F3D0)
val ExpenseMuted = AppColors.Expense
val ExpenseSoft = Color(0xFFFECDD3)
val TransferGray = AppColors.Transfer

val SystemBlue = Color(0xFF60A5FA)
val SystemViolet = Color(0xFFA78BFA)
val SystemTeal = Color(0xFF2DD4BF)

val OnBackgroundDark = AppColors.OnBackground
val OnSurfaceDark = PremiumPalette.Slate200
val OnSurfaceVariantDark = AppColors.OnSurfaceVariant
val OnPrimaryDark = AppColors.OnAccent

val SecondaryDark = PremiumPalette.Slate800
val OnSecondaryDark = PremiumPalette.Slate200

val ErrorRed = AppColors.Expense
val OnErrorDark = PremiumPalette.Slate950
val ErrorContainerDark = Color(0xFF3F1D2A)
val OnErrorContainerDark = Color(0xFFFECDD3)

val BackgroundLight = Color(0xFFF8FAFC)
val GroupedBackgroundLight = Color(0xFFFFFFFF)
val SurfaceLight = Color(0xFFFFFFFF)
val SurfaceVariantLight = Color(0xFFF1F5F9)
val OutlineLight = Color(0xFFE2E8F0)
val GlassOverlayLight = Color(0xF5FFFFFF)
val OnBackgroundLight = PremiumPalette.Slate950
val OnSurfaceLight = PremiumPalette.Slate950
val OnSurfaceVariantLight = PremiumPalette.Slate500

val SurfaceBorderDark = AppColors.CardBorder
val SurfaceBorderLight = Color(0x14000000)

val BackgroundGlowCoral = BackgroundGlowWarm
val BackgroundGlowBlue = BackgroundGlowCool

/** Donut / ring chart stroke — thicker for premium legibility */
val ChartStrokeWidth = 10.dp

/** Muted label for timestamps and metadata */
val SecondaryLabelAlpha = 0.72f
