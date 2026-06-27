package com.aus.ausgegeben.sync

import android.content.Context
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.dao.CategoryDao
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.ReceiptFileUtils
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private data class CategoryMergeRow(val item: Category, val deleted: Boolean)
private data class ExpenseMergeRow(val item: Expense, val deleted: Boolean)

class SyncManager(
    private val categoryDao: CategoryDao,
    private val expenseDao: ExpenseDao,
    private val preferenceManager: PreferenceManager,
    private val authManager: CloudAuthManager,
    private val appContext: Context,
    private val cloudRepo: CloudSyncRepository = CloudSyncRepository(),
) : CloudSyncDelegate {

    private val syncMutex = Mutex()

    private fun uid(): String? = authManager.currentUser.value?.uid

    private fun isActive(): Boolean = authManager.isSignedIn

    override suspend fun onCategoryInserted(category: Category) {
        pushCategory(category)
    }

    override suspend fun onCategoryUpdated(category: Category) {
        pushCategory(category)
    }

    override suspend fun onCategoryDeleted(id: Long) {
        if (!isActive()) return
        val userId = uid() ?: return
        cloudRepo.tombstoneCategory(userId, id)
        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
    }

    override suspend fun onExpenseInserted(expense: Expense) {
        pushExpense(expense)
    }

    override suspend fun onExpenseUpdated(expense: Expense) {
        pushExpense(expense)
    }

    override suspend fun onExpenseDeleted(id: Long) {
        if (!isActive()) return
        val userId = uid() ?: return
        cloudRepo.tombstoneExpense(userId, id)
        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
    }

    override suspend fun onPreferencesChanged() {
        if (!isActive()) return
        val userId = uid() ?: return
        cloudRepo.pushPreferences(userId, preferenceManager.toSyncedPreferences())
        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
    }

    suspend fun fullSync() {
        if (!isActive()) return
        val userId = uid() ?: return

        syncMutex.withLock {
            authManager.setSyncing(true)
            try {
                val localCategories = categoryDao.getAllCategoriesOnce()
                val localExpenses = expenseDao.getAllExpensesOnce()
                val localPrefs = preferenceManager.toSyncedPreferences()

                val remoteCategories = cloudRepo.pullCategories(userId)
                val remoteExpenses = cloudRepo.pullExpenses(userId)
                val remotePrefs = cloudRepo.pullPreferences(userId)

                val catMerge = mergeCategories(localCategories, remoteCategories)
                val expMerge = mergeExpenses(localExpenses, remoteExpenses)
                val mergedPrefs = mergePreferences(localPrefs, remotePrefs)

                for (id in catMerge.toDeleteLocal) {
                    expenseDao.deleteByCategoryId(id)
                    categoryDao.deleteById(id)
                }
                for (category in catMerge.toApplyLocal) {
                    categoryDao.insert(category)
                }
                for (id in expMerge.toDeleteLocal) {
                    val expense = expenseDao.getById(id)
                    expenseDao.deleteById(id)
                    expense?.receiptImagePath?.let { path ->
                        ReceiptFileUtils.deleteIfStored(appContext, path)
                    }
                }
                for (expense in expMerge.toApplyLocal) {
                    expenseDao.insert(expense)
                }

                preferenceManager.applySyncedPreferences(mergedPrefs)

                cloudRepo.pushAll(userId, catMerge.toPushRemote, expMerge.toPushRemote)
                cloudRepo.pushPreferences(userId, mergedPrefs)

                preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
            } finally {
                authManager.setSyncing(false)
            }
        }
    }

    private suspend fun pushCategory(category: Category) {
        if (!isActive() || category.id == 0L) return
        val userId = uid() ?: return
        cloudRepo.pushCategory(userId, category)
        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
    }

    private suspend fun pushExpense(expense: Expense) {
        if (!isActive() || expense.id == 0L) return
        val userId = uid() ?: return
        cloudRepo.pushExpense(userId, expense)
        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
    }

    private fun mergeCategories(
        local: List<Category>,
        remote: List<CloudCategory>,
    ): MergeResult<Category> {
        val localRows = local.map { CategoryMergeRow(it, false) }
        val remoteRows = remote.map { CategoryMergeRow(it.category, it.deleted) }
        val merged = mergeById(
            localItems = localRows,
            remoteItems = remoteRows,
            idSelector = { it.item.id },
            updatedAtSelector = { recordTimestamp(it.item.updatedAt) },
            deletedSelector = { it.deleted },
        )
        return MergeResult(
            toApplyLocal = merged.toApplyLocal.map { it.item },
            toPushRemote = merged.toPushRemote.map { it.item },
            toDeleteLocal = merged.toDeleteLocal,
        )
    }

    private fun mergeExpenses(
        local: List<Expense>,
        remote: List<CloudExpense>,
    ): MergeResult<Expense> {
        val localRows = local.map { ExpenseMergeRow(it, false) }
        val remoteRows = remote.map { ExpenseMergeRow(it.expense, it.deleted) }
        val merged = mergeById(
            localItems = localRows,
            remoteItems = remoteRows,
            idSelector = { it.item.id },
            updatedAtSelector = { recordTimestamp(it.item.updatedAt, it.item.dateMillis) },
            deletedSelector = { it.deleted },
        )
        return MergeResult(
            toApplyLocal = merged.toApplyLocal.map { it.item },
            toPushRemote = merged.toPushRemote.map { it.item },
            toDeleteLocal = merged.toDeleteLocal,
        )
    }
}
