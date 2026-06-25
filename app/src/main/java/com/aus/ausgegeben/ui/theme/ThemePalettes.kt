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

private val DefaultDarkColorScheme = darkColorScheme(
    primary = AccentCoral,
    onPrimary = OnPrimaryDark,
    primaryContainer = Color(0xFF3A2220),
    onPrimaryContainer = Color(0xFFFFDDD6),
    secondary = SecondaryDark,
    onSecondary = OnSecondaryDark,
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = BackgroundDark,
    onBackground = OnBackgroundDark,
    surface = SurfaceDark,
    onSurface = OnSurfaceDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    outline = OutlineDark,
    outlineVariant = OutlineVariantDark,
    error = ErrorRed,
    onError = OnErrorDark,
    errorContainer = ErrorContainerDark,
    onErrorContainer = OnErrorContainerDark
)

private val DefaultLightColorScheme = lightColorScheme(
    primary = AccentCoral,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4DF),
    onPrimaryContainer = Color(0xFF4A1E18),
    secondary = Color(0xFFE8E8EE),
    onSecondary = Color(0xFF3A3A42),
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = BackgroundLight,
    onBackground = OnBackgroundLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    outline = OutlineLight,
    outlineVariant = Color(0xFFE0E0E8),
    error = ErrorRed,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4DF),
    onErrorContainer = Color(0xFF4A1E18)
)

private val AmoledColorScheme = darkColorScheme(
    primary = Color(0xFFFF6B57),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF3A1E1A),
    onPrimaryContainer = Color(0xFFFFDDD6),
    secondary = Color(0xFF1A1A1A),
    onSecondary = Color(0xFFE8E8EC),
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = Color(0xFF000000),
    onBackground = Color(0xFFF2F2F5),
    surface = Color(0xFF0A0A0A),
    onSurface = Color(0xFFEEEEF2),
    surfaceVariant = Color(0xFF141414),
    onSurfaceVariant = Color(0xFF9A9AA2),
    outline = Color(0xFF2A2A2A),
    outlineVariant = Color(0xFF3A3A3A),
    error = ErrorRed,
    onError = OnErrorDark,
    errorContainer = ErrorContainerDark,
    onErrorContainer = OnErrorContainerDark
)

private val MidnightColorScheme = darkColorScheme(
    primary = Color(0xFF7EB6FF),
    onPrimary = Color(0xFF0A1628),
    primaryContainer = Color(0xFF1A3050),
    onPrimaryContainer = Color(0xFFD4E8FF),
    secondary = Color(0xFF1E2A3A),
    onSecondary = Color(0xFFD8E4F0),
    tertiary = SystemTeal,
    onTertiary = Color(0xFF0A1A18),
    background = Color(0xFF0A0E14),
    onBackground = Color(0xFFE8EEF5),
    surface = Color(0xFF121820),
    onSurface = Color(0xFFE0E6EE),
    surfaceVariant = Color(0xFF1A2230),
    onSurfaceVariant = Color(0xFF9AA8B8),
    outline = Color(0xFF2A3545),
    outlineVariant = Color(0xFF3A4555),
    error = Color(0xFFFF7A7A),
    onError = Color.White,
    errorContainer = Color(0xFF3A2028),
    onErrorContainer = Color(0xFFFFD4D4)
)

private val OceanColorScheme = darkColorScheme(
    primary = Color(0xFF4ECDC4),
    onPrimary = Color(0xFF0A1A18),
    primaryContainer = Color(0xFF1A3A38),
    onPrimaryContainer = Color(0xFFB8F0EC),
    secondary = Color(0xFF1A2A28),
    onSecondary = Color(0xFFD0E8E4),
    tertiary = SystemBlue,
    onTertiary = Color.White,
    background = Color(0xFF0A1214),
    onBackground = Color(0xFFE8F2F0),
    surface = Color(0xFF101A1C),
    onSurface = Color(0xFFE0ECEA),
    surfaceVariant = Color(0xFF1A2628),
    onSurfaceVariant = Color(0xFF94A8A4),
    outline = Color(0xFF2A383A),
    outlineVariant = Color(0xFF3A484A),
    error = Color(0xFFFF8A80),
    onError = Color.White,
    errorContainer = Color(0xFF3A2220),
    onErrorContainer = Color(0xFFFFD4D0)
)

private val SoftLightColorScheme = lightColorScheme(
    primary = Color(0xFFE85A4A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE8E4),
    onPrimaryContainer = Color(0xFF4A2018),
    secondary = Color(0xFFF0E8E4),
    onSecondary = Color(0xFF4A3A36),
    tertiary = Color(0xFF8A7AB8),
    onTertiary = Color.White,
    background = Color(0xFFFBF7F4),
    onBackground = Color(0xFF1E1816),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1E1816),
    surfaceVariant = Color(0xFFF3ECE8),
    onSurfaceVariant = Color(0xFF6A5A56),
    outline = Color(0xFFD8CCC6),
    outlineVariant = Color(0xFFE8DED8),
    error = ErrorRed,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4DF),
    onErrorContainer = Color(0xFF4A1E18)
)
