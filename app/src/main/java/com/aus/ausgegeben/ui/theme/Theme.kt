package com.aus.ausgegeben.ui.theme

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Shapes defined in ThemeShapes.kt — GroupedShape, AppShapes

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
    val activity = LocalActivity.current

    if (!view.isInEditMode && activity != null) {
        SideEffect {
            val controller = WindowCompat.getInsetsController(activity.window, view)
            controller.isAppearanceLightStatusBars = !resolvedDark
            controller.isAppearanceLightNavigationBars = !resolvedDark
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = AppShapes,
        content = content
    )
}
