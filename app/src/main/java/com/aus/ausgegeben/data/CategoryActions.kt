package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Category
import kotlinx.coroutines.flow.Flow

/** Narrow category surface used by CategoryViewModel (easy to fake in unit tests). */
/**
 * A category firestore.rules will refuse, blocking an atomic reorder batch.
 * Carries the offending names so the UI can say which row needs fixing rather than
 * repeating a generic failure the user cannot act on. Mirrors web UnwritableCategoryError.
 */
class UnwritableCategoryException(val categoryNames: String) :
    IllegalStateException("UNWRITABLE_CATEGORY")

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
