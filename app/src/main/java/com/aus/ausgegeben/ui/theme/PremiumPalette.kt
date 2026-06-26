package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * FinTech-grade dark palette — rich slate grays, not pure black.
 * Semantic greens/reds tuned for WCAG AA on slate surfaces.
 */
object PremiumPalette {
    val Slate950 = Color(0xFF0F172A)
    val Slate900 = Color(0xFF1E293B)
    val Slate800 = Color(0xFF334155)
    val Slate700 = Color(0xFF475569)
    val Slate500 = Color(0xFF64748B)
    val Slate400 = Color(0xFF94A3B8)
    val Slate200 = Color(0xFFE2E8F0)
    val Slate50 = Color(0xFFF8FAFC)

    /** Income / positive — emerald-400, ~4.6:1 on Slate900 */
    val Income = Color(0xFF34D399)

    /** Expense / negative — rose-400, ~4.8:1 on Slate900 */
    val Expense = Color(0xFFFB7185)

    /** Primary brand accent — electric blue */
    val Accent = Color(0xFF3B82F6)
    val OnAccent = Color(0xFFFFFFFF)

    val GlassBorder = Color(0x14FFFFFF)
    val GlassHighlight = Color(0x0FFFFFFF)
    val FocusRing = Color(0xFF60A5FA)
}
