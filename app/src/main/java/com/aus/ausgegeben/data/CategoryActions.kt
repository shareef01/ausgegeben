package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Category
import kotlinx.coroutines.flow.Flow

/** Narrow category surface used by CategoryViewModel (easy to fake in unit tests). */
interface CategoryActions {
    val allCategories: Flow<List<Category>>
    suspend fun insertCategory(category: Category): Result<String>
    suspend fun updateCategory(category: Category): Result<Unit>
    suspend fun updateCategoriesBatch(categories: List<Category>): Result<Unit>
    suspend fun deleteCategory(category: Category): Result<Unit>
    suspend fun deduplicateCategories(): Result<Unit>
    suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String): Result<Unit>
    suspend fun countExpensesForCategory(categoryId: String): Int
}
