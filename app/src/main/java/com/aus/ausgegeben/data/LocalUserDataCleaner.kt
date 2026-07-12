package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.dao.CategoryDao
import com.aus.ausgegeben.util.ReceiptFileUtils

class LocalUserDataCleaner(
    private val database: AusgegebenDatabase,
    private val appContext: Context,
    private val preferenceManager: PreferenceManager,
    private val categoryDao: CategoryDao,
) {
    /** Wipes user tables and receipt files, then re-seeds default categories. */
    suspend fun clearForAccountSwitch() {
        wipeUserTablesAndReceipts()
    }

    /** User-initiated wipe (Settings). Clears account marker so the next sign-in is a fresh pull. */
    suspend fun clearAllUserData() {
        wipeUserTablesAndReceipts()
        preferenceManager.setLastCloudUserId(null)
    }

    private suspend fun wipeUserTablesAndReceipts() {
        database.clearAllTables()
        ReceiptFileUtils.clearAllReceipts(appContext)
        preferenceManager.clearCloudSyncState()
        DataSeeder.seedIfEmpty(categoryDao)
    }
}
