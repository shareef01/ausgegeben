package com.aus.ausgegeben.data

enum class StorageMode(val storageKey: String) {
    LOCAL("local"),
    CLOUD("cloud");

    companion object {
        fun fromStorageKey(key: String?): StorageMode =
            entries.firstOrNull { it.storageKey == key } ?: LOCAL
    }
}
