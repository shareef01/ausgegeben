package com.aus.ausgegeben.sync

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense

interface CloudSyncDelegate {
    suspend fun onCategoryInserted(category: Category) {}
    suspend fun onCategoryUpdated(category: Category) {}
    suspend fun onCategoryDeleted(id: Long) {}
    suspend fun onExpenseInserted(expense: Expense) {}
    suspend fun onExpenseUpdated(expense: Expense) {}
    suspend fun onExpenseDeleted(id: Long) {}
    suspend fun onPreferencesChanged() {}
}

object NoOpCloudSyncDelegate : CloudSyncDelegate
