package com.aus.ausgegeben.data.cloud

import com.aus.ausgegeben.data.dao.CategoryDao
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.ReceiptFileUtils
import android.content.Context
import androidx.room.withTransaction
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

class CloudSyncRepository(
    private val authRepository: AuthRepository,
    private val categoryDao: CategoryDao,
    private val expenseDao: ExpenseDao,
    private val appContext: Context,
    private val database: com.aus.ausgegeben.data.AusgegebenDatabase,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    companion object {
        private const val SYNC_TIMEOUT_MS = 45_000L
        private const val MAX_BATCH_SIZE = 450
    }

    private fun userCollection(path: String) =
        authRepository.currentUserId?.let { uid ->
            firestore.collection("users").document(uid).collection(path)
        }

    suspend fun fullSync(): Result<Unit> = runCatching {
        val uid = authRepository.currentUserId ?: return@runCatching
        authRepository.ensureFreshAuthToken().getOrThrow()
        withTimeout(SYNC_TIMEOUT_MS) {
            verifyFirestoreAccess(uid)

            val localCategories = categoryDao.getAllCategoriesOnce()
            val localExpenses = expenseDao.getAllExpensesOnce()

            val remoteCategories = pullCategories(uid)
            val remoteExpenses = pullExpenses(uid)

            val catMerge = mergeCategories(localCategories, remoteCategories)
            val expMerge = mergeExpenses(localExpenses, remoteExpenses)

            val receiptPathsToDelete = mutableListOf<String>()
            database.withTransaction {
                for (id in catMerge.toDeleteLocal) {
                    expenseDao.deleteByCategoryId(id)
                    categoryDao.deleteById(id)
                }
                val categoriesToApply = catMerge.toApplyLocal.map { it.toEntity() }
                if (categoriesToApply.isNotEmpty()) {
                    categoryDao.insertAll(categoriesToApply)
                }

                for (id in expMerge.toDeleteLocal) {
                    expenseDao.getById(id)?.receiptImagePath?.let(receiptPathsToDelete::add)
                    expenseDao.deleteById(id)
                }
                val expensesToApply = expMerge.toApplyLocal.map { it.toEntity() }
                if (expensesToApply.isNotEmpty()) {
                    expenseDao.insertAll(expensesToApply)
                }
            }
            receiptPathsToDelete.forEach { path ->
                ReceiptFileUtils.deleteIfStored(appContext, path)
            }

            pushAll(uid, catMerge.toPushRemote, expMerge.toPushRemote)
        }
    }

    private suspend fun verifyFirestoreAccess(uid: String) {
        val userRef = firestore.collection("users").document(uid)
        userRef.set(mapOf("lastPullAt" to System.currentTimeMillis()), SetOptions.merge()).await()
    }

    suspend fun pushCategory(category: Category) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("categories")?.document(category.id.toString())
                ?.set(category.toFirestorePayload(), SetOptions.merge())
                ?.await()
        }
    }

    suspend fun deleteCategory(categoryId: Long) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("categories")?.document(categoryId.toString())
                ?.set(
                    mapOf("deleted" to true, "updatedAt" to System.currentTimeMillis()),
                    SetOptions.merge(),
                )
                ?.await()
        }
    }

    suspend fun pushExpense(expense: Expense) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("expenses")?.document(expense.id.toString())
                ?.set(expense.toFirestorePayload(), SetOptions.merge())
                ?.await()
        }
    }

    suspend fun deleteExpense(expenseId: Long) {
        withTimeout(SYNC_TIMEOUT_MS) {
            userCollection("expenses")?.document(expenseId.toString())
                ?.set(
                    mapOf("deleted" to true, "updatedAt" to System.currentTimeMillis()),
                    SetOptions.merge(),
                )
                ?.await()
        }
    }

    private suspend fun pullCategories(uid: String): List<CloudCategoryRecord> {
        val snap = firestore.collection("users").document(uid).collection("categories").get().await()
        return snap.documents.mapNotNull { doc ->
            val id = doc.id.toLongOrNull() ?: return@mapNotNull null
            doc.toCategoryRecord(id)
        }
    }

    private suspend fun pullExpenses(uid: String): List<CloudExpenseRecord> {
        val snap = firestore.collection("users").document(uid).collection("expenses").get().await()
        return snap.documents.mapNotNull { doc ->
            val id = doc.id.toLongOrNull() ?: return@mapNotNull null
            doc.toExpenseRecord(id)
        }
    }

    private suspend fun pushAll(
        uid: String,
        categories: List<CloudCategoryRecord>,
        expenses: List<CloudExpenseRecord>,
    ) {
        val userRef = firestore.collection("users").document(uid)
        val writes = mutableListOf<(com.google.firebase.firestore.WriteBatch) -> Unit>()
        writes += { batch ->
            batch.set(
                userRef,
                mapOf("lastPushAt" to System.currentTimeMillis()),
                SetOptions.merge(),
            )
        }
        categories.forEach { record ->
            writes += { batch ->
                val ref = userRef.collection("categories").document(record.id.toString())
                batch.set(ref, record.toFirestorePayload(), SetOptions.merge())
            }
        }
        expenses.forEach { record ->
            writes += { batch ->
                val ref = userRef.collection("expenses").document(record.id.toString())
                batch.set(ref, record.toFirestorePayload(), SetOptions.merge())
            }
        }
        commitInChunks(writes)
    }

    private suspend fun commitInChunks(writes: List<(com.google.firebase.firestore.WriteBatch) -> Unit>) {
        writes.chunked(MAX_BATCH_SIZE).forEach { chunk ->
            val batch = firestore.batch()
            chunk.forEach { it(batch) }
            batch.commit().await()
        }
    }

    private fun mergeCategories(
        local: List<Category>,
        remote: List<CloudCategoryRecord>,
    ): MergeResult<CloudCategoryRecord> {
        val localRows = local.map { it.toCloudRecord(localUpdatedAt = 0L) }
        val merged = mergeById(
            localItems = localRows,
            remoteItems = remote,
            idSelector = { it.id },
            updatedAtSelector = { it.updatedAt },
            deletedSelector = { it.deleted },
        )
        return MergeResult(
            toApplyLocal = merged.toApplyLocal,
            toPushRemote = merged.toPushRemote,
            toDeleteLocal = merged.toDeleteLocal,
        )
    }

    private fun mergeExpenses(
        local: List<Expense>,
        remote: List<CloudExpenseRecord>,
    ): MergeResult<CloudExpenseRecord> {
        val localRows = local.map { it.toCloudRecord(localUpdatedAt = 0L) }
        val merged = mergeById(
            localItems = localRows,
            remoteItems = remote,
            idSelector = { it.id },
            updatedAtSelector = { recordTimestamp(it.updatedAt, it.dateMillis) },
            deletedSelector = { it.deleted },
        )
        return MergeResult(
            toApplyLocal = merged.toApplyLocal,
            toPushRemote = merged.toPushRemote,
            toDeleteLocal = merged.toDeleteLocal,
        )
    }

    private fun Category.toCloudRecord(localUpdatedAt: Long) = CloudCategoryRecord(
        id = id,
        name = name,
        iconName = iconName,
        colorInt = colorInt,
        transactionType = transactionType,
        sortOrder = sortOrder,
        updatedAt = localUpdatedAt,
    )

    private fun Expense.toCloudRecord(localUpdatedAt: Long) = CloudExpenseRecord(
        id = id,
        amount = amount,
        dateMillis = dateMillis,
        categoryId = categoryId,
        note = note,
        receiptImagePath = receiptImagePath,
        transactionType = transactionType,
        updatedAt = localUpdatedAt,
    )

    private fun Category.toFirestorePayload() = mapOf(
        "name" to name,
        "iconName" to iconName,
        "colorInt" to colorInt.toLong(),
        "transactionType" to transactionType,
        "sortOrder" to sortOrder,
        "updatedAt" to System.currentTimeMillis(),
        "deleted" to false,
    )

    private fun Expense.toFirestorePayload() = mapOf(
        "amount" to amount,
        "dateMillis" to dateMillis,
        "categoryId" to categoryId,
        "note" to note,
        "receiptImagePath" to receiptImagePath,
        "transactionType" to transactionType,
        "updatedAt" to System.currentTimeMillis(),
        "deleted" to false,
    )

    private fun CloudCategoryRecord.toEntity() = Category(
        id = id,
        name = name,
        iconName = iconName,
        colorInt = colorInt,
        transactionType = transactionType,
        sortOrder = sortOrder,
    )

    private fun CloudExpenseRecord.toEntity() = Expense(
        id = id,
        amount = amount,
        dateMillis = dateMillis,
        categoryId = categoryId,
        note = note,
        receiptImagePath = receiptImagePath,
        transactionType = transactionType,
    )

    private fun CloudCategoryRecord.toFirestorePayload() = mapOf(
        "name" to name,
        "iconName" to iconName,
        "colorInt" to colorInt.toLong(),
        "transactionType" to transactionType,
        "sortOrder" to sortOrder,
        "updatedAt" to updatedAt,
        "deleted" to false,
    )

    private fun CloudExpenseRecord.toFirestorePayload() = mapOf(
        "amount" to amount,
        "dateMillis" to dateMillis,
        "categoryId" to categoryId,
        "note" to note,
        "receiptImagePath" to receiptImagePath,
        "transactionType" to transactionType,
        "updatedAt" to updatedAt,
        "deleted" to false,
    )

    private fun com.google.firebase.firestore.DocumentSnapshot.toCategoryRecord(id: Long): CloudCategoryRecord? {
        if (getBoolean("deleted") == true) {
            return CloudCategoryRecord(
                id = id,
                name = "",
                iconName = "",
                colorInt = 0,
                transactionType = "expense",
                sortOrder = 0,
                updatedAt = numberLong("updatedAt"),
                deleted = true,
            )
        }
        val name = getString("name") ?: return null
        return CloudCategoryRecord(
            id = id,
            name = name,
            iconName = getString("iconName") ?: "shopping_bag",
            colorInt = numberInt("colorInt", 0xff6a9fd4.toInt()),
            transactionType = getString("transactionType") ?: "expense",
            sortOrder = numberInt("sortOrder", 0),
            updatedAt = numberLong("updatedAt"),
        )
    }

    private fun com.google.firebase.firestore.DocumentSnapshot.toExpenseRecord(id: Long): CloudExpenseRecord? {
        if (getBoolean("deleted") == true) {
            return CloudExpenseRecord(
                id = id,
                amount = 0.0,
                dateMillis = 0L,
                categoryId = 0L,
                note = "",
                receiptImagePath = null,
                transactionType = "expense",
                updatedAt = numberLong("updatedAt"),
                deleted = true,
            )
        }
        return CloudExpenseRecord(
            id = id,
            amount = getDouble("amount") ?: numberDouble("amount"),
            dateMillis = numberLong("dateMillis"),
            categoryId = numberLong("categoryId"),
            note = getString("note") ?: "",
            receiptImagePath = getString("receiptImagePath"),
            transactionType = getString("transactionType") ?: "expense",
            updatedAt = numberLong("updatedAt", numberLong("dateMillis")),
        )
    }

    private fun com.google.firebase.firestore.DocumentSnapshot.numberLong(field: String, fallback: Long = 0L): Long =
        (get(field) as? Number)?.toLong() ?: fallback

    private fun com.google.firebase.firestore.DocumentSnapshot.numberInt(field: String, fallback: Int = 0): Int =
        (get(field) as? Number)?.toInt() ?: fallback

    private fun com.google.firebase.firestore.DocumentSnapshot.numberDouble(field: String): Double =
        (get(field) as? Number)?.toDouble() ?: 0.0
}
