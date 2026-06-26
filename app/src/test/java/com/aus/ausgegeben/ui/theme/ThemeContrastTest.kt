package com.aus.ausgegeben.ui.theme

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * WCAG 2.1 contrast ratio checks for theme tokens (AA normal text ≥ 4.5:1).
 */
class ThemeContrastTest {

    @Test
    fun darkTheme_secondaryText_onSurface_passesAa() {
        val ratio = contrastRatio(OnSurfaceVariantDark, SurfaceDark)
        assertTrue("onSurfaceVariant on surface: $ratio", ratio >= 4.5)
    }

    @Test
    fun lightTheme_secondaryText_onSurface_passesAa() {
        val ratio = contrastRatio(OnSurfaceVariantLight, SurfaceLight)
        assertTrue("onSurfaceVariant on surface: $ratio", ratio >= 4.5)
    }

    @Test
    fun lightTheme_secondaryText_onSurfaceVariant_passesAa() {
        val ratio = contrastRatio(OnSurfaceVariantLight, SurfaceVariantLight)
        assertTrue("onSurfaceVariant on surfaceVariant: $ratio", ratio >= 4.5)
    }

    @Test
    fun lightTheme_transferText_onWhite_passesAa() {
        val ratio = contrastRatio(TransferGrayLight, SurfaceLight)
        assertTrue("transfer on white: $ratio", ratio >= 4.5)
    }

    @Test
    fun lavender_secondaryText_onSurfaceVariant_passesAa() {
        val ratio = contrastRatio(androidx.compose.ui.graphics.Color(0xFF574F68), androidx.compose.ui.graphics.Color(0xFFF3EEFF))
        assertTrue("lavender onSurfaceVariant: $ratio", ratio >= 4.5)
    }

    @Test
    fun lightTheme_incomeText_onIncomeChip_passesAa() {
        val chipBackground = blendOnWhite(IncomeGreenLight, alpha = 0.1f)
        val ratio = contrastRatio(IncomeGreenLight, chipBackground)
        assertTrue("income on income chip: $ratio", ratio >= 4.5)
    }

    private fun blendOnWhite(foreground: androidx.compose.ui.graphics.Color, alpha: Float): androidx.compose.ui.graphics.Color {
        val a = alpha.coerceIn(0f, 1f)
        return androidx.compose.ui.graphics.Color(
            red = 1f * (1f - a) + foreground.red * a,
            green = 1f * (1f - a) + foreground.green * a,
            blue = 1f * (1f - a) + foreground.blue * a,
            alpha = 1f,
        )
    }

    private fun contrastRatio(foreground: androidx.compose.ui.graphics.Color, background: androidx.compose.ui.graphics.Color): Double {
        val l1 = relativeLuminance(foreground)
        val l2 = relativeLuminance(background)
        val lighter = maxOf(l1, l2)
        val darker = minOf(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private fun relativeLuminance(color: androidx.compose.ui.graphics.Color): Double {
        fun channel(c: Float): Double {
            return if (c <= 0.03928) c / 12.92 else Math.pow(((c + 0.055) / 1.055), 2.4)
        }
        val r = channel(color.red)
        val g = channel(color.green)
        val b = channel(color.blue)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
}
