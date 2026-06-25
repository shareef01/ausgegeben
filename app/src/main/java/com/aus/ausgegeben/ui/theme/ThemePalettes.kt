package com.aus.ausgegeben.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

internal fun colorSchemeFor(mode: ThemeMode, systemDark: Boolean): ColorScheme {
    val dark = mode.resolvesDark(systemDark)
    return when (mode) {
        ThemeMode.AMOLED -> AmoledColorScheme
        ThemeMode.MIDNIGHT -> MidnightColorScheme
        ThemeMode.OCEAN -> OceanColorScheme
        ThemeMode.SOFT_LIGHT -> SoftLightColorScheme
        ThemeMode.SYSTEM, ThemeMode.DARK, ThemeMode.LIGHT -> if (dark) DefaultDarkColorScheme else DefaultLightColorScheme
    }
}

private fun baseDarkScheme(
    primary: Color = AppColors.Expense,
    tertiary: Color = SystemViolet
): ColorScheme = darkColorScheme(
    primary = primary,
    onPrimary = AppColors.Background,
    primaryContainer = Color(0xFF3F2222),
    onPrimaryContainer = Color(0xFFFFD4D4),
    secondary = SecondaryDark,
    onSecondary = OnSecondaryDark,
    tertiary = tertiary,
    onTertiary = Color.White,
    background = AppColors.Background,
    onBackground = OnBackgroundDark,
    surface = AppColors.CardSurface,
    onSurface = OnSurfaceDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    outline = OutlineDark,
    outlineVariant = OutlineVariantDark,
    error = AppColors.Expense,
    onError = OnErrorDark,
    errorContainer = ErrorContainerDark,
    onErrorContainer = OnErrorContainerDark
)

private val DefaultDarkColorScheme = baseDarkScheme()

private val DefaultLightColorScheme = lightColorScheme(
    primary = AppColors.Expense,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E4),
    onPrimaryContainer = Color(0xFF4A1A1A),
    secondary = Color(0xFFF4F4F5),
    onSecondary = Color(0xFF3F3F46),
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = BackgroundLight,
    onBackground = OnBackgroundLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    outline = OutlineLight,
    outlineVariant = Color(0xFFD4D4D8),
    error = AppColors.Expense,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E4),
    onErrorContainer = Color(0xFF4A1A1A)
)

private val AmoledColorScheme = baseDarkScheme()

private val MidnightColorScheme = baseDarkScheme(
    primary = Color(0xFF93C5FD),
    tertiary = SystemTeal
)

private val OceanColorScheme = baseDarkScheme(
    primary = Color(0xFF2DD4BF),
    tertiary = SystemBlue
)

private val SoftLightColorScheme = lightColorScheme(
    primary = AppColors.Expense,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E4),
    onPrimaryContainer = Color(0xFF4A1A1A),
    secondary = Color(0xFFF4F4F5),
    onSecondary = Color(0xFF3F3F46),
    tertiary = Color(0xFFA78BFA),
    onTertiary = Color.White,
    background = Color(0xFFFAFAFA),
    onBackground = AppColors.Background,
    surface = Color(0xFFFFFFFF),
    onSurface = AppColors.Background,
    surfaceVariant = Color(0xFFF4F4F5),
    onSurfaceVariant = Color(0xFF71717A),
    outline = Color(0xFFE4E4E7),
    outlineVariant = Color(0xFFD4D4D8),
    error = AppColors.Expense,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E4),
    onErrorContainer = Color(0xFF4A1A1A)
)
