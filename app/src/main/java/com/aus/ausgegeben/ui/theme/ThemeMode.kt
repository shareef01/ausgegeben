package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color

enum class ThemeMode(val storageKey: String, val label: String) {
    SYSTEM("system", "System"),
    LIGHT("light", "Light"),
    DARK("dark", "Dark"),
    AMOLED("amoled", "AMOLED black"),
    MIDNIGHT("midnight", "Midnight blue"),
    OCEAN("ocean", "Ocean teal"),
    FOREST("forest", "Forest green"),
    SUNSET("sunset", "Sunset coral"),
    LAVENDER("lavender", "Lavender"),
    SOFT_LIGHT("soft_light", "Soft Light");

    fun resolvesDark(systemDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemDark
        LIGHT, LAVENDER, SOFT_LIGHT -> false
        else -> true
    }

    companion object {
        fun fromStorageKey(key: String?): ThemeMode =
            entries.find { it.storageKey == key } ?: SYSTEM
    }
}

/** Previews for the theme selection UI. */
internal fun ThemeMode.getPreviewColors(): List<Color> = when (this) {
    ThemeMode.SYSTEM -> listOf(Color(0xFF09090B), Color(0xFFFAFAFA))
    ThemeMode.LIGHT -> listOf(Color(0xFFFFFFFF), Color(0xFF10B981))
    ThemeMode.DARK -> listOf(Color(0xFF000000), Color(0xFF10B981))
    ThemeMode.AMOLED -> listOf(Color(0xFF000000), Color(0xFFFFFFFF))
    ThemeMode.MIDNIGHT -> listOf(Color(0xFF070B1A), Color(0xFF8AB4FF))
    ThemeMode.OCEAN -> listOf(Color(0xFF061412), Color(0xFF56D6C9))
    ThemeMode.FOREST -> listOf(Color(0xFF040F0A), Color(0xFF22C55E))
    ThemeMode.SUNSET -> listOf(Color(0xFF190B10), Color(0xFFFF9F6E))
    ThemeMode.LAVENDER -> listOf(Color(0xFFFCFAFF), Color(0xFF7C3AED))
    ThemeMode.SOFT_LIGHT -> listOf(Color(0xFFFAF7F2), Color(0xFF7C5E44))
}
