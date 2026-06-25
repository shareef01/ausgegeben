package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// ── DESIGN TOKENS ───────────────────────────────────────────────────────────
object AppColors {
    /** Primary app background */
    val Background = Color(0xFF0C0C0E)

    /** Elevated surface — barely lifted from background */
    val CardSurface = Color(0xFF141416)

    /** Hairline separators */
    val CardBorder = Color(0x0FFFFFFF)

    /** Expenses — vibrant coral red */
    val Expense = Color(0xFFE85D5D)

    /** Income — vibrant finance green */
    val Income = Color(0xFF22C55E)

    /** Primary CTA on dark surfaces — neutral, not semantic red */
    val Accent = Color(0xFFFAFAFA)

    val OnAccent = Color(0xFF09090B)

    /** Numpad key press / hover */
    val NumpadPress = Color(0x1AFFFFFF)

    val OnBackground = Color(0xFFFAFAFA)
    val OnSurfaceVariant = Color(0xFF8E8E93)
    val Transfer = Color(0xFFA1A1AA)
}

// ── Palette aliases ───────────────────────────────────────────────────────────
val BackgroundDark = AppColors.Background
val BackgroundElevated = Color(0xFF111113)
val BackgroundGlowWarm = Color(0xFF141218)
val BackgroundGlowCool = Color(0xFF101218)
val BackgroundGlowMint = Color(0xFF101412)

val SurfaceDark = AppColors.CardSurface
val SurfaceElevatedDark = Color(0xFF1F1F23)
val SurfaceVariantDark = Color(0xFF27272A)
val TertiarySurfaceDark = Color(0xFF2E2E33)
val OutlineDark = Color(0xFF3F3F46)
val OutlineVariantDark = Color(0xFF52525B)
val SeparatorDark = Color(0xFF52525B)
val GlassOverlayDark = Color(0xE618181B)

val AccentCoral = AppColors.Expense
val AccentCoralSoft = Color(0xFFE8C8C8)
val AccentRed = AppColors.Expense

val IncomeGreen = AppColors.Income
val IncomeGreenSoft = Color(0xFFB5D4C8)
val ExpenseMuted = AppColors.Expense
val ExpenseSoft = Color(0xFFE0BCBC)
val TransferGray = AppColors.Transfer

val SystemBlue = Color(0xFF7EB0E8)
val SystemViolet = Color(0xFFA99AE0)
val SystemTeal = Color(0xFF7ABFB4)

val OnBackgroundDark = AppColors.OnBackground
val OnSurfaceDark = Color(0xFFF4F4F5)
val OnSurfaceVariantDark = AppColors.OnSurfaceVariant
val OnPrimaryDark = AppColors.OnAccent

val SecondaryDark = Color(0xFF27272A)
val OnSecondaryDark = Color(0xFFE4E4E7)

val ErrorRed = AppColors.Expense
val OnErrorDark = AppColors.Background
val ErrorContainerDark = Color(0xFF2A2224)
val OnErrorContainerDark = Color(0xFFE8D0D0)

val BackgroundLight = Color(0xFFFAFAFA)
val GroupedBackgroundLight = Color(0xFFFFFFFF)
val SurfaceLight = Color(0xFFFFFFFF)
val SurfaceVariantLight = Color(0xFFF4F4F5)
val OutlineLight = Color(0xFFE4E4E7)
val GlassOverlayLight = Color(0xF5FFFFFF)
val OnBackgroundLight = Color(0xFF09090B)
val OnSurfaceLight = Color(0xFF09090B)
val OnSurfaceVariantLight = Color(0xFF71717A)

val SurfaceBorderDark = AppColors.CardBorder
val SurfaceBorderLight = Color(0x14000000)

val BackgroundGlowCoral = BackgroundGlowWarm
val BackgroundGlowBlue = BackgroundGlowCool

/** Chart ring stroke */
val ChartStrokeWidth = 6.dp
