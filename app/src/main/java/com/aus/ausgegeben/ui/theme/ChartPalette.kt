package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/** Muted, harmonious palette for charts and category colors. */
val ChartPalette: List<Color> = listOf(
    Color(0xFFD9A0A0), // dusty rose
    Color(0xFF8FBFA9), // sage
    Color(0xFF7EB0E8), // slate blue
    Color(0xFFA99AE0), // lavender
    Color(0xFFDDB98A), // sand
    Color(0xFF7ABFB4), // teal
    Color(0xFFC9A0B0), // mauve
    Color(0xFFB8A888), // ochre
)

/** Tunes a category color so it reads well on charts (boosts darks, softens harsh brights). */
fun Color.forChartDisplay(fallbackIndex: Int = 0): Color {
    val lum = luminance()
    return when {
        lum < 0.10f -> ChartPalette[fallbackIndex % ChartPalette.size]
        lum < 0.22f -> copy(
            red = (red + 0.12f).coerceAtMost(1f),
            green = (green + 0.12f).coerceAtMost(1f),
            blue = (blue + 0.12f).coerceAtMost(1f),
            alpha = 1f
        )
        lum > 0.88f -> copy(
            red = red * 0.88f,
            green = green * 0.88f,
            blue = blue * 0.88f,
            alpha = 1f
        )
        else -> copy(alpha = 1f)
    }
}

fun chartColorAt(index: Int): Color = ChartPalette[index % ChartPalette.size]

fun Color.chartHighlight(): Color = copy(
    red = (red + (1f - red) * 0.12f).coerceAtMost(1f),
    green = (green + (1f - green) * 0.12f).coerceAtMost(1f),
    blue = (blue + (1f - blue) * 0.12f).coerceAtMost(1f),
    alpha = 1f
)

fun Color.chartShadow(): Color = copy(
    red = red * 0.85f,
    green = green * 0.85f,
    blue = blue * 0.85f,
    alpha = 1f
)
