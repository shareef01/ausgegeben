package com.aus.ausgegeben.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

val GroupedShape = RoundedCornerShape(14.dp)
val GlassShape = RoundedCornerShape(28.dp)
val CapsuleShape = RoundedCornerShape(50)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

private val CustomDarkColorScheme = darkColorScheme(
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

private val CustomLightColorScheme = lightColorScheme(
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

@Composable
fun AusgegebenTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    darkTheme: Boolean? = null,
    content: @Composable () -> Unit
) {
    val resolvedDark = darkTheme ?: when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val colorScheme = if (resolvedDark) CustomDarkColorScheme else CustomLightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !resolvedDark
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !resolvedDark
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = AppShapes,
        content = content
    )
}
