package com.aus.ausgegeben.ui.theme

enum class ThemeMode(val storageKey: String, val label: String) {
    SYSTEM("system", "System"),
    DARK("dark", "Dark"),
    LIGHT("light", "Light");

    companion object {
        fun fromStorageKey(key: String?): ThemeMode =
            entries.find { it.storageKey == key } ?: SYSTEM
    }
}
