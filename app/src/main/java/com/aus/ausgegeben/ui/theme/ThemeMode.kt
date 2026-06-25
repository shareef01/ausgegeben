package com.aus.ausgegeben.ui.theme

enum class ThemeMode(val storageKey: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    AMOLED("amoled"),
    MIDNIGHT("midnight"),
    OCEAN("ocean"),
    SOFT_LIGHT("soft_light");

    companion object {
        fun fromStorageKey(key: String?): ThemeMode =
            entries.find { it.storageKey == key } ?: SYSTEM
    }

    fun resolvesDark(systemDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemDark
        LIGHT, SOFT_LIGHT -> false
        DARK, AMOLED, MIDNIGHT, OCEAN -> true
    }
}
