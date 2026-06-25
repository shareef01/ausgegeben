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
    tertiary: Color = SystemViolet,
    background: Color = AppColors.Background,
    surface: Color = AppColors.CardSurface,
    surfaceVariant: Color = SurfaceVariantDark,
    secondary: Color = SecondaryDark,
    outline: Color = OutlineDark,
    outlineVariant: Color = OutlineVariantDark,
    onSurfaceVariant: Color = OnSurfaceVariantDark,
): ColorScheme = darkColorScheme(
    primary = primary,
    onPrimary = AppColors.OnAccent,
    primaryContainer = surfaceVariant,
    onPrimaryContainer = OnBackgroundDark,
    secondary = secondary,
    onSecondary = OnSecondaryDark,
    tertiary = tertiary,
    onTertiary = Color.White,
    background = background,
    onBackground = OnBackgroundDark,
    surface = surface,
    onSurface = OnSurfaceDark,
    surfaceVariant = surfaceVariant,
    onSurfaceVariant = onSurfaceVariant,
    outline = outline,
    outlineVariant = outlineVariant,
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

private val AmoledColorScheme = baseDarkScheme(
    primary = Color.White,
    tertiary = Color(0xFFBDBDBD),
    background = Color.Black,
    surface = Color(0xFF050505),
    surfaceVariant = Color(0xFF101010),
    secondary = Color(0xFF121212),
    outline = Color(0xFF242424),
    outlineVariant = Color(0xFF303030),
    onSurfaceVariant = Color(0xFF9A9A9A),
)

private val MidnightColorScheme = baseDarkScheme(
    primary = Color(0xFF8AB4FF),
    tertiary = Color(0xFFC4B5FD),
    background = Color(0xFF070B1A),
    surface = Color(0xFF0D1326),
    surfaceVariant = Color(0xFF17203A),
    secondary = Color(0xFF111A33),
    outline = Color(0xFF2B3657),
    outlineVariant = Color(0xFF3D4B73),
    onSurfaceVariant = Color(0xFFAAB4CF),
)

private val OceanColorScheme = baseDarkScheme(
    primary = Color(0xFF56D6C9),
    tertiary = Color(0xFF7EB0E8),
    background = Color(0xFF061412),
    surface = Color(0xFF0B1F1D),
    surfaceVariant = Color(0xFF12332F),
    secondary = Color(0xFF102A27),
    outline = Color(0xFF24504B),
    outlineVariant = Color(0xFF346D66),
    onSurfaceVariant = Color(0xFFA0C7C1),
)

private val SoftLightColorScheme = lightColorScheme(
    primary = Color(0xFF7C5E44),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF0E3D2),
    onPrimaryContainer = Color(0xFF2A1D14),
    secondary = Color(0xFFEFE7DC),
    onSecondary = Color(0xFF4A3B2E),
    tertiary = Color(0xFF9D7A63),
    onTertiary = Color.White,
    background = Color(0xFFFAF7F2),
    onBackground = Color(0xFF1D1A17),
    surface = Color(0xFFFFFCF7),
    onSurface = Color(0xFF1D1A17),
    surfaceVariant = Color(0xFFF0E8DC),
    onSurfaceVariant = Color(0xFF7B6D61),
    outline = Color(0xFFE0D5C8),
    outlineVariant = Color(0xFFD1C4B6),
    error = AppColors.Expense,
    onError = Color.White,
    errorContainer = Color(0xFFF5E8E8),
    onErrorContainer = Color(0xFF5C3A3A)
)
