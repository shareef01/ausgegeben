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
    primaryContainer = Color(0xFF3F2222),
    onPrimaryContainer = Color(0xFFFFD4D4),
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
    error = ErrorRed,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E4),
    onErrorContainer = Color(0xFF4A1A1A)
)

private val AmoledColorScheme = darkColorScheme(
    primary = AccentCoral,
    onPrimary = OnPrimaryDark,
    primaryContainer = Color(0xFF3F2222),
    onPrimaryContainer = Color(0xFFFFD4D4),
    secondary = Color(0xFF18181B),
    onSecondary = Color(0xFFE4E4E7),
    tertiary = SystemViolet,
    onTertiary = Color.White,
    background = Color(0xFF09090B),
    onBackground = Color(0xFFFAFAFA),
    surface = Color(0xFF111113),
    onSurface = Color(0xFFF4F4F5),
    surfaceVariant = Color(0xFF18181B),
    onSurfaceVariant = Color(0xFFA1A1AA),
    outline = Color(0xFF27272A),
    outlineVariant = Color(0xFF3F3F46),
    error = ErrorRed,
    onError = OnErrorDark,
    errorContainer = ErrorContainerDark,
    onErrorContainer = OnErrorContainerDark
)

private val MidnightColorScheme = darkColorScheme(
    primary = Color(0xFF93C5FD),
    onPrimary = Color(0xFF09090B),
    primaryContainer = Color(0xFF1E3A5F),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = Color(0xFF1E293B),
    onSecondary = Color(0xFFE2E8F0),
    tertiary = SystemTeal,
    onTertiary = Color(0xFF09090B),
    background = Color(0xFF09090B),
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFE2E8F0),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF334155),
    outlineVariant = Color(0xFF475569),
    error = Color(0xFFF87171),
    onError = Color.White,
    errorContainer = Color(0xFF3F2222),
    onErrorContainer = Color(0xFFFECACA)
)

private val OceanColorScheme = darkColorScheme(
    primary = Color(0xFF2DD4BF),
    onPrimary = Color(0xFF09090B),
    primaryContainer = Color(0xFF134E4A),
    onPrimaryContainer = Color(0xFFCCFBF1),
    secondary = Color(0xFF1A2E2C),
    onSecondary = Color(0xFFD1FAE5),
    tertiary = SystemBlue,
    onTertiary = Color.White,
    background = Color(0xFF09090B),
    onBackground = Color(0xFFF0FDFA),
    surface = Color(0xFF0F1A19),
    onSurface = Color(0xFFE6FFFA),
    surfaceVariant = Color(0xFF1A2E2C),
    onSurfaceVariant = Color(0xFF94B8B0),
    outline = Color(0xFF2D4A46),
    outlineVariant = Color(0xFF3D5A56),
    error = Color(0xFFF87171),
    onError = Color.White,
    errorContainer = Color(0xFF3F2222),
    onErrorContainer = Color(0xFFFECACA)
)

private val SoftLightColorScheme = lightColorScheme(
    primary = Color(0xFFFF7A7A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E4),
    onPrimaryContainer = Color(0xFF4A1A1A),
    secondary = Color(0xFFF4F4F5),
    onSecondary = Color(0xFF3F3F46),
    tertiary = Color(0xFFA78BFA),
    onTertiary = Color.White,
    background = Color(0xFFFAFAFA),
    onBackground = Color(0xFF09090B),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF09090B),
    surfaceVariant = Color(0xFFF4F4F5),
    onSurfaceVariant = Color(0xFF71717A),
    outline = Color(0xFFE4E4E7),
    outlineVariant = Color(0xFFD4D4D8),
    error = ErrorRed,
    onError = Color.White,
    errorContainer = Color(0xFFFFE4E4),
    onErrorContainer = Color(0xFF4A1A1A)
)
