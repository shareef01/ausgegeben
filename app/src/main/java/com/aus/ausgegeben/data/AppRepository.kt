package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.dao.CategoryDao
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.sync.CloudSyncDelegate
import com.aus.ausgegeben.sync.NoOpCloudSyncDelegate
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.aus.ausgegeben.util.repairStoredCategoryColor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class AppRepository(
    private val categoryDao: CategoryDao,
    private val expenseDao: ExpenseDao,
    private val appContext: Context,
    private val cloudSync: CloudSyncDelegate = NoOpCloudSyncDelegate,
) {
    // Categories
    val allCategories: Flow<List<Category>> = categoryDao.getAllCategories()
        .map { categories ->
            categories.map { category ->
                val repaired = repairStoredCategoryColor(category.colorInt, category.name)
                if (repaired == category.colorInt) category else category.copy(colorInt = repaired)
            }
        }
        .distinctUntilChanged()

    suspend fun insertCategory(category: Category): Long {
        val stamped = stampCategory(category)
        val id = categoryDao.insert(stamped.copy(id = 0))
        val saved = stamped.copy(id = id)
        cloudSync.onCategoryInserted(saved)
        return id
    }

    suspend fun updateCategory(category: Category) {
        val stamped = stampCategory(category)
        categoryDao.update(stamped)
        cloudSync.onCategoryUpdated(stamped)
    }

    suspend fun insertAllCategories(categories: List<Category>) = categoryDao.insertAll(categories)

    suspend fun deleteCategory(category: Category) {
        val linkedExpenses = expenseDao.getExpensesForCategory(category.id)
        categoryDao.delete(category)
        linkedExpenses.forEach { expense ->
            cloudSync.onExpenseDeleted(expense.id)
            purgeReceiptIfUnreferenced(expense.receiptImagePath)
        }
        cloudSync.onCategoryDeleted(category.id)
    }

    // Expenses
    val allExpenses: Flow<List<Expense>> = expenseDao.getAllExpenses()

    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
        expenseDao.getExpensesInRange(startMillis, endMillis)

    fun pagedExpenses(params: ExpenseQueryParams): Flow<PagingData<Expense>> {
        return Pager(
            config = PagingConfig(
                pageSize = 30,
                prefetchDistance = 15,
                initialLoadSize = 30,
                enablePlaceholders = false
            ),
            pagingSourceFactory = { ExpensePagingSource(expenseDao, params) }
        ).flow
    }

    fun getExpensesByCategory(categoryId: Long): Flow<List<Expense>> =
        expenseDao.getExpensesByCategory(categoryId)

    suspend fun insertExpense(expense: Expense): Long {
        val stamped = stampExpense(expense)
        val id = if (stamped.id == 0L) {
            expenseDao.insert(stamped)
        } else {
            expenseDao.insert(stamped)
            stamped.id
        }
        val saved = stamped.copy(id = id)
        cloudSync.onExpenseInserted(saved)
        return id
    }

    suspend fun insertAllExpenses(expenses: List<Expense>) = expenseDao.insertAll(expenses)

    suspend fun deleteExpense(expense: Expense) {
        expenseDao.delete(expense)
        cloudSync.onExpenseDeleted(expense.id)
    }

    suspend fun duplicateExpense(expense: Expense) {
        val copiedReceipt = ReceiptFileUtils.copyReceipt(appContext, expense.receiptImagePath)
        insertExpense(
            expense.copy(
                id = 0L,
                dateMillis = System.currentTimeMillis(),
                receiptImagePath = copiedReceipt
            )
        )
    }

    suspend fun updateExpense(expense: Expense) {
        val previous = expenseDao.getById(expense.id)
        val stamped = stampExpense(expense)
        expenseDao.update(stamped)
        cloudSync.onExpenseUpdated(stamped)
        if (previous?.receiptImagePath != expense.receiptImagePath) {
            purgeReceiptIfUnreferenced(previous?.receiptImagePath, excludeExpenseId = expense.id)
        }
    }

    suspend fun purgeReceiptIfUnreferenced(path: String?, excludeExpenseId: Long = 0L) {
        if (path.isNullOrBlank()) return
        if (expenseDao.countByReceiptPath(path, excludeExpenseId) == 0) {
            ReceiptFileUtils.deleteIfStored(appContext, path)
        }
    }

    suspend fun updateExpenseTypesForCategory(categoryId: Long, transactionType: String) =
        expenseDao.updateTransactionTypeForCategory(categoryId, transactionType)

    suspend fun countExpensesForCategory(categoryId: Long): Int =
        expenseDao.countByCategory(categoryId)

    suspend fun sumMonthExpenses(excludeExpenseId: Long = 0L): Double {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis()
            ?: return 0.0
        return expenseDao.sumExpensesInRange(range.first, range.second, excludeExpenseId)
    }

    /** One-time fix for categories saved with a broken ARGB value (showed as black circles). */
    suspend fun repairBrokenCategoryColors() {
        categoryDao.getAllCategories().first().forEach { category ->
            val repaired = repairStoredCategoryColor(category.colorInt, category.name)
            if (repaired != category.colorInt) {
                updateCategory(category.copy(colorInt = repaired))
            }
        }
    }

    private fun stampCategory(category: Category): Category =
        category.copy(updatedAt = System.currentTimeMillis())

    private fun stampExpense(expense: Expense): Expense =
        expense.copy(updatedAt = System.currentTimeMillis())
}
