package com.aus.ausgegeben.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing

val GroupedShape = RoundedCornerShape(AppRadius.lg)
val GlassShape = RoundedCornerShape(AppRadius.xl + AppSpacing.xs)
val CapsuleShape = RoundedCornerShape(AppRadius.pill)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(AppRadius.sm),
    small = RoundedCornerShape(AppRadius.md),
    medium = RoundedCornerShape(AppRadius.lg),
    large = RoundedCornerShape(AppRadius.xl),
    extraLarge = RoundedCornerShape(AppRadius.xl + AppSpacing.xs)
)

@Composable
fun AusgegebenTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    darkTheme: Boolean? = null,
    content: @Composable () -> Unit
) {
    val systemDark = isSystemInDarkTheme()
    val resolvedDark = darkTheme ?: themeMode.resolvesDark(systemDark)
    val colorScheme = colorSchemeFor(themeMode, systemDark)
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
