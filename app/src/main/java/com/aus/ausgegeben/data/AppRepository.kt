package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.dao.CategoryDao
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.aus.ausgegeben.util.repairStoredCategoryColor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class AppRepository(
    private val categoryDao: CategoryDao,
    private val expenseDao: ExpenseDao,
    private val appContext: Context
) {
    // Categories
    val allCategories: Flow<List<Category>> = categoryDao.getAllCategories().map { categories ->
        categories.map { category ->
            category.copy(
                colorInt = repairStoredCategoryColor(category.colorInt, category.name)
            )
        }
    }

    suspend fun insertCategory(category: Category): Long = categoryDao.insert(category)

    suspend fun updateCategory(category: Category) = categoryDao.update(category)

    suspend fun insertAllCategories(categories: List<Category>) = categoryDao.insertAll(categories)

    suspend fun deleteCategory(category: Category) = categoryDao.delete(category)

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

    suspend fun insertExpense(expense: Expense) = expenseDao.insert(expense)

    suspend fun insertAllExpenses(expenses: List<Expense>) = expenseDao.insertAll(expenses)

    suspend fun deleteExpense(expense: Expense) {
        ReceiptFileUtils.deleteIfStored(appContext, expense.receiptImagePath)
        expenseDao.delete(expense)
    }

    suspend fun updateExpense(expense: Expense) = expenseDao.update(expense)

    suspend fun updateExpenseTypesForCategory(categoryId: Long, transactionType: String) =
        expenseDao.updateTransactionTypeForCategory(categoryId, transactionType)

    suspend fun countExpensesForCategory(categoryId: Long): Int =
        expenseDao.countByCategory(categoryId)

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
