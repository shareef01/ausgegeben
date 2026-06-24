package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/** Curated hues that stay distinct and readable on both dark and light backgrounds. */
val ChartPalette: List<Color> = listOf(
    Color(0xFFFF8A7A), // coral
    Color(0xFFFFBE7A), // apricot
    Color(0xFF5ED49A), // mint
    Color(0xFF6EC8E8), // sky
    Color(0xFF9B8FEF), // lavender
    Color(0xFFE89BC4), // rose
    Color(0xFF7BC8B5), // seafoam
    Color(0xFFD4A96A), // honey
)

/** Tunes a category color so it reads well on charts (boosts darks, softens harsh brights). */
fun Color.forChartDisplay(fallbackIndex: Int = 0): Color {
    val lum = luminance()
    return when {
        lum < 0.10f -> ChartPalette[fallbackIndex % ChartPalette.size]
        lum < 0.22f -> copy(
            red = (red + 0.14f).coerceAtMost(1f),
            green = (green + 0.14f).coerceAtMost(1f),
            blue = (blue + 0.14f).coerceAtMost(1f),
            alpha = 1f
        )
        lum > 0.88f -> copy(
            red = red * 0.86f,
            green = green * 0.86f,
            blue = blue * 0.86f,
            alpha = 1f
        )
        else -> copy(alpha = 1f)
    }
}

fun chartColorAt(index: Int): Color = ChartPalette[index % ChartPalette.size]

/** Slightly lighter tone for arc highlights and bar gradients. */
fun Color.chartHighlight(): Color {
    return copy(
        red = (red + (1f - red) * 0.22f).coerceAtMost(1f),
        green = (green + (1f - green) * 0.22f).coerceAtMost(1f),
        blue = (blue + (1f - blue) * 0.22f).coerceAtMost(1f),
        alpha = 1f
    )
}

/** Slightly deeper tone for shadows and bar gradients. */
fun Color.chartShadow(): Color {
    return copy(
        red = red * 0.78f,
        green = green * 0.78f,
        blue = blue * 0.78f,
        alpha = 1f
    )
}
