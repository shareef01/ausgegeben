package com.aus.ausgegeben.util

/**
 * Version of the orphan-expense sweep. Bump when repair logic changes so
 * accounts that already have `orphansScannedAt` still run the new pass once.
 *
 * Missing version + existing `orphansScannedAt` is treated as version 0
 * (the unversioned scan that shipped first).
 */
object OrphanScan {
    const val VERSION = 1L

    fun needsSweep(data: Map<String, Any>?): Boolean {
        if (data == null) return true
        val recorded = when (val version = data["orphansScanVersion"]) {
            is Number -> version.toLong()
            else -> if (data.containsKey("orphansScannedAt")) 0L else -1L
        }
        return recorded < VERSION
    }
}
