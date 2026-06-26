package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.cloud.CloudSyncRepository
import com.aus.ausgegeben.data.dao.CategoryDao
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
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
    private val cloudSync: CloudSyncRepository? = null,
    private val shouldSyncToCloud: suspend () -> Boolean = { false },
) {
    private suspend fun syncToCloud(action: suspend CloudSyncRepository.() -> Unit) {
        if (!shouldSyncToCloud()) return
        runCatching { cloudSync?.action() }
    }

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
        val id = categoryDao.insert(category)
        val saved = category.copy(id = if (category.id == 0L) id else category.id)
        syncToCloud { pushCategory(saved) }
        return id
    }

    suspend fun updateCategory(category: Category) {
        categoryDao.update(category)
        syncToCloud { pushCategory(category) }
    }

    suspend fun insertAllCategories(categories: List<Category>) = categoryDao.insertAll(categories)

    suspend fun deleteCategory(category: Category) {
        val linkedExpenses = expenseDao.getExpensesForCategory(category.id)
        categoryDao.delete(category)
        linkedExpenses.forEach { expense ->
            purgeReceiptIfUnreferenced(expense.receiptImagePath)
        }
        syncToCloud { deleteCategory(category.id) }
    }

    // Expenses
    val allExpenses: Flow<List<Expense>> = expenseDao.getAllExpenses()

    /** Emits a new value whenever expense rows change, used to invalidate paging. */
    val expensesRevision: Flow<Int> = expenseDao.getAllExpenses()
        .map { it.hashCode() }
        .distinctUntilChanged()

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
        val id = expenseDao.insert(expense)
        val saved = expense.copy(id = if (expense.id == 0L) id else expense.id)
        syncToCloud { pushExpense(saved) }
        return id
    }

    suspend fun insertAllExpenses(expenses: List<Expense>) = expenseDao.insertAll(expenses)

    suspend fun deleteExpense(expense: Expense) {
        expenseDao.delete(expense)
        syncToCloud { deleteExpense(expense.id) }
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
        expenseDao.update(expense)
        if (previous?.receiptImagePath != expense.receiptImagePath) {
            purgeReceiptIfUnreferenced(previous?.receiptImagePath, excludeExpenseId = expense.id)
        }
        syncToCloud { pushExpense(expense) }
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
                categoryDao.update(category.copy(colorInt = repaired))
            }
        }
    }
}
