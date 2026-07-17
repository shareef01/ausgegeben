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
        ThemeMode.FOREST -> ForestColorScheme
        ThemeMode.SUNSET -> SunsetColorScheme
        ThemeMode.LAVENDER -> LavenderColorScheme
        ThemeMode.SOFT_LIGHT -> SoftLightColorScheme
        ThemeMode.SYSTEM, ThemeMode.DARK, ThemeMode.LIGHT -> if (dark) DefaultDarkColorScheme else DefaultLightColorScheme
    }
}

private fun baseDarkScheme(
    primary: Color = AppColors.Accent,
    tertiary: Color = SystemViolet,
    background: Color = AppColors.Background,
    surface: Color = AppColors.CardSurface,
    surfaceVariant: Color = Color(0xFF121214),
    secondary: Color = Color(0xFF18181B),
    outline: Color = Color(0xFF27272A),
    outlineVariant: Color = AppColors.CardBorder,
    onSurfaceVariant: Color = AppColors.OnSurfaceVariant,
    error: Color = AppColors.Expense,
): ColorScheme = darkColorScheme(
    primary = primary,
    onPrimary = AppColors.OnAccent,
    primaryContainer = surfaceVariant,
    onPrimaryContainer = AppColors.OnBackground,
    secondary = secondary,
    onSecondary = Color.White,
    tertiary = tertiary,
    onTertiary = Color.White,
    background = background,
    onBackground = AppColors.OnBackground,
    surface = surface,
    onSurface = Color.White,
    surfaceVariant = surfaceVariant,
    onSurfaceVariant = onSurfaceVariant,
    outline = outline,
    outlineVariant = outlineVariant,
    error = error,
    onError = Color.Black,
    errorContainer = Color(0xFF2A1212),
    onErrorContainer = Color(0xFFFFDADA)
)

private val DefaultDarkColorScheme = baseDarkScheme()

private val DefaultLightColorScheme = lightColorScheme(
    primary = Color(0xFF09090B),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF1F1F4),
    onPrimaryContainer = Color(0xFF09090B),
    secondary = Color(0xFFF4F4F5),
    onSecondary = Color(0xFF3F3F46),
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF09090B),
    surface = Color.White,
    onSurface = Color(0xFF09090B),
    surfaceVariant = Color(0xFFF8F8FA),
    onSurfaceVariant = Color(0xFF52525B),
    outline = Color(0xFFE4E4E7),
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
    error = Color(0xFFFF8A9A),
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
    error = Color(0xFFFF8F80),
)

private val ForestColorScheme = baseDarkScheme(
    primary = Color(0xFF22C55E), // Electric Mint
    tertiary = Color(0xFFFACC15),
    background = Color(0xFF040F0A),
    surface = Color(0xFF0B2416),
    surfaceVariant = Color(0xFF11321F),
    secondary = Color(0xFF0D2D1B),
    outline = Color(0xFF1A4D2E),
    outlineVariant = Color(0xFF24633C),
    onSurfaceVariant = Color(0xFF9ABFA4), // Muted green for secondary labels
    error = Color(0xFFF97373), // Coral Red
)

private val SunsetColorScheme = baseDarkScheme(
    primary = Color(0xFFFF9F6E),
    tertiary = Color(0xFFFFD166),
    background = Color(0xFF190B10),
    surface = Color(0xFF271119),
    surfaceVariant = Color(0xFF3B1A23),
    secondary = Color(0xFF32151E),
    outline = Color(0xFF6D3440),
    outlineVariant = Color(0xFF8F4652),
    onSurfaceVariant = Color(0xFFE6B2A8),
    error = Color(0xFFFF6B6B),
)

private val LavenderColorScheme = lightColorScheme(
    primary = Color(0xFF7C3AED),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEDE9FE),
    onPrimaryContainer = Color(0xFF2E1065),
    secondary = Color(0xFFF1EEFF),
    onSecondary = Color(0xFF4C1D95),
    tertiary = Color(0xFFDB2777),
    onTertiary = Color.White,
    background = Color(0xFFFCFAFF),
    onBackground = Color(0xFF1E1B2E),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1E1B2E),
    surfaceVariant = Color(0xFFF3EEFF),
    onSurfaceVariant = Color(0xFF574F68),
    outline = Color(0xFFE2D8F4),
    outlineVariant = Color(0xFFD4C5EB),
    error = Color(0xFFE11D48),
    onError = Color.White,
    errorContainer = Color(0xFFFCE7F3),
    onErrorContainer = Color(0xFF831843)
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
    onSurfaceVariant = Color(0xFF5C4F42),
    outline = Color(0xFFE0D5C8),
    outlineVariant = Color(0xFFD1C4B6),
    error = Color(0xFFC2410C),
    onError = Color.White,
    errorContainer = Color(0xFFF5E8E8),
    onErrorContainer = Color(0xFF5C3A3A)
)
