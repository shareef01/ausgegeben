package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance

/**
 * Contrast helpers shared by the finance color tokens and their tests.
 *
 * The semantic finance hues (`AppColors.Expense` coral, `AppColors.Income` emerald)
 * are tuned as fills, gradients and chart strokes. Reused directly as *text* on a
 * light surface they miss WCAG 2.2 AA — coral on white is roughly 2.7:1 — which
 * made expense amounts and destructive actions hard to read. Text and icon tints
 * therefore use a derived variant that keeps the hue but clears AA on every
 * surface it can land on; fills keep the original token untouched.
 */

/** WCAG 2.2 AA minimum contrast for normal-size text. */
internal const val AA_TEXT_CONTRAST = 4.5

/** WCAG 2.2 AA minimum contrast for large text and non-text UI. */
internal const val AA_LARGE_TEXT_CONTRAST = 3.0

/** WCAG relative contrast ratio between two opaque colors. */
internal fun relativeContrast(a: Color, b: Color): Double {
    val l1 = a.luminance().toDouble()
    val l2 = b.luminance().toDouble()
    return (maxOf(l1, l2) + 0.05) / (minOf(l1, l2) + 0.05)
}

/**
 * Returns [base] when it already clears [target] against every background, or the
 * closest mix of [base] toward black/white that does. The direction follows the
 * backgrounds' lightness so dark themes lighten and light themes darken, which is
 * what keeps the result recognisably the same hue instead of flipping to grey.
 */
internal fun ensureAaTextColor(
    base: Color,
    backgrounds: List<Color>,
    target: Double = AA_TEXT_CONTRAST,
): Color {
    fun worst(candidate: Color): Double = backgrounds.minOf { relativeContrast(candidate, it) }
    if (worst(base) >= target) return base
    val toward = if ((backgrounds.firstOrNull() ?: base).luminance() < 0.5f) Color.White else Color.Black
    for (step in 1..50) {
        val candidate = lerp(base, toward, step / 50f)
        if (worst(candidate) >= target) return candidate
    }
    return toward
}
