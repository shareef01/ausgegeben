package com.aus.ausgegeben.data.cloud

import com.aus.ausgegeben.data.dao.CategoryDao
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

class CloudSyncRepository(
    private val authRepository: AuthRepository,
    private val categoryDao: CategoryDao,
    private val expenseDao: ExpenseDao,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    companion object {
        private const val SYNC_TIMEOUT_MS = 20_000L
    }

    private fun userCollection(path: String) =
        authRepository.currentUserId?.let { uid ->
            firestore.collection("users").document(uid).collection(path)
        }

    suspend fun fullSync(): Result<Unit> = runCatching {
        val uid = authRepository.currentUserId ?: return@runCatching
        withTimeout(SYNC_TIMEOUT_MS) {
            pushAllLocal(uid)
            pullAllRemote(uid)
        }
    }

    suspend fun pushCategory(category: Category) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("categories")?.document(category.id.toString())
                ?.set(category.toFirestore(), SetOptions.merge())
                ?.await()
        }
    }

    suspend fun deleteCategory(categoryId: Long) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("categories")?.document(categoryId.toString())?.delete()?.await()
        }
    }

    suspend fun pushExpense(expense: Expense) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("expenses")?.document(expense.id.toString())
                ?.set(expense.toFirestore(), SetOptions.merge())
                ?.await()
        }
    }

    suspend fun deleteExpense(expenseId: Long) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("expenses")?.document(expenseId.toString())?.delete()?.await()
        }
    }

    private suspend fun pushAllLocal(uid: String) {
        val categories = categoryDao.getAllCategories().first()
        val expenses = expenseDao.getAllExpenses().first()
        val batch = firestore.batch()
        val userRef = firestore.collection("users").document(uid)
        batch.set(userRef, mapOf("lastPushAt" to System.currentTimeMillis()), SetOptions.merge())
        categories.forEach { category ->
            val ref = userRef.collection("categories").document(category.id.toString())
            batch.set(ref, category.toFirestore(), SetOptions.merge())
        }
        expenses.forEach { expense ->
            val ref = userRef.collection("expenses").document(expense.id.toString())
            batch.set(ref, expense.toFirestore(), SetOptions.merge())
        }
        batch.commit().await()
    }

    private suspend fun pullAllRemote(uid: String) {
        val userRef = firestore.collection("users").document(uid)
        val categories = userRef.collection("categories").get().await()
        categories.documents.mapNotNull { it.toCategory() }.forEach { categoryDao.insert(it) }
        val expenses = userRef.collection("expenses").get().await()
        expenses.documents.mapNotNull { it.toExpense() }.forEach { expenseDao.insert(it) }
    }

    private fun Category.toFirestore(): Map<String, Any?> = mapOf(
        "id" to id,
        "name" to name,
        "iconName" to iconName,
        "colorInt" to colorInt,
        "transactionType" to transactionType,
        "sortOrder" to sortOrder,
        "updatedAt" to System.currentTimeMillis(),
    )

    private fun Expense.toFirestore(): Map<String, Any?> = mapOf(
        "id" to id,
        "amount" to amount,
        "dateMillis" to dateMillis,
        "categoryId" to categoryId,
        "note" to note,
        "receiptImagePath" to receiptImagePath,
        "transactionType" to transactionType,
        "updatedAt" to System.currentTimeMillis(),
    )

    private fun com.google.firebase.firestore.DocumentSnapshot.toCategory(): Category? {
        val id = getLong("id") ?: return null
        val name = getString("name") ?: return null
        return Category(
            id = id,
            name = name,
            iconName = getString("iconName").orEmpty(),
            colorInt = getLong("colorInt")?.toInt() ?: 0,
            transactionType = getString("transactionType") ?: "expense",
            sortOrder = getLong("sortOrder")?.toInt() ?: 0,
        )
    }

    private fun com.google.firebase.firestore.DocumentSnapshot.toExpense(): Expense? {
        val id = getLong("id") ?: return null
        return Expense(
            id = id,
            amount = getDouble("amount") ?: 0.0,
            dateMillis = getLong("dateMillis") ?: 0L,
            categoryId = getLong("categoryId") ?: 0L,
            note = getString("note").orEmpty(),
            receiptImagePath = getString("receiptImagePath"),
            transactionType = getString("transactionType") ?: "expense",
        )
    }
}
