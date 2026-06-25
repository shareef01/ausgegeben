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
    primary: Color = AppColors.Accent,
    tertiary: Color = SystemViolet
): ColorScheme = darkColorScheme(
    primary = primary,
    onPrimary = AppColors.OnAccent,
    primaryContainer = SurfaceVariantDark,
    onPrimaryContainer = OnBackgroundDark,
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
    primary = AppColors.Background,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF4F4F5),
    onPrimaryContainer = AppColors.Background,
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
    errorContainer = Color(0xFFF5E8E8),
    onErrorContainer = Color(0xFF5C3A3A)
)

private val AmoledColorScheme = baseDarkScheme().copy(
    background = Color.Black,
    surface = Color(0xFF0A0A0A),
    surfaceVariant = Color(0xFF141414),
)

private val MidnightColorScheme = baseDarkScheme(
    primary = Color(0xFF93C5FD),
    tertiary = SystemTeal
)

private val OceanColorScheme = baseDarkScheme(
    primary = Color(0xFF2DD4BF),
    tertiary = SystemBlue
)

private val SoftLightColorScheme = lightColorScheme(
    primary = AppColors.Background,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF4F4F5),
    onPrimaryContainer = AppColors.Background,
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
    errorContainer = Color(0xFFF5E8E8),
    onErrorContainer = Color(0xFF5C3A3A)
)
