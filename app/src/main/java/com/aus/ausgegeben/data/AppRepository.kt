package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID
import java.util.Locale
import kotlin.math.round

class AppRepository(
    private val appContext: Context,
    private val authRepository: AuthRepository,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    companion object {
        const val UNCATEGORIZED_ID = "0"
    }

    private fun uid(): String? = authRepository.currentUserId

    private fun catCol(uid: String) = firestore.collection("users").document(uid).collection("categories")
    private fun expCol(uid: String) = firestore.collection("users").document(uid).collection("expenses")
    private fun catDoc(uid: String, id: String) = catCol(uid).document(id)
    private fun expDoc(uid: String, id: String) = expCol(uid).document(id)

    suspend fun ensureSeeded() {
        val u = uid() ?: return
        val snap = catCol(u).get().await()
        if (snap.isEmpty) {
            val defaults = listOf(
                Category(name = "Groceries", iconName = "shopping_cart", colorInt = 0xffe86b5a.toInt(), transactionType = "expense", sortOrder = 0),
                Category(name = "Shopping", iconName = "shopping_bag", colorInt = 0xffe8a060.toInt(), transactionType = "expense", sortOrder = 1),
                Category(name = "Dining", iconName = "restaurant", colorInt = 0xffd4849a.toInt(), transactionType = "expense", sortOrder = 2),
                Category(name = "Transport", iconName = "car", colorInt = 0xff6a9fd4.toInt(), transactionType = "expense", sortOrder = 3),
                Category(name = "Bills", iconName = "bolt", colorInt = 0xff9a8fd4.toInt(), transactionType = "expense", sortOrder = 4),
                Category(name = "Subscriptions", iconName = "subscriptions", colorInt = 0xff5ab8aa.toInt(), transactionType = "expense", sortOrder = 5),
                Category(name = "Salary", iconName = "credit_card", colorInt = 0xff5cb88a.toInt(), transactionType = "income", sortOrder = 0),
                Category(name = "Freelance", iconName = "work", colorInt = 0xff6a9fd4.toInt(), transactionType = "income", sortOrder = 1),
                Category(name = "Refunds", iconName = "undo", colorInt = 0xffb8a060.toInt(), transactionType = "income", sortOrder = 2),
                Category(name = "Transfer", iconName = "swap_horiz", colorInt = 0xff8e8e96.toInt(), transactionType = "transfer", sortOrder = 0),
            )
            defaults.forEach { c ->
                catDoc(u, c.id).set(categoryPayload(c)).await()
            }
        } else {
            deduplicateCategories()
        }
        ensureUncategorizedCategory(u)
    }

    suspend fun deduplicateCategories() {
        val u = uid() ?: return
        
        // SECURE: Fetch ALL categories directly (no orderBy) to catch docs missing sortOrder
        val allSnap = catCol(u).get().await()
        val categories = allSnap.documents.mapNotNull { categoryFromDoc(it) }
            .filter { it.id != UNCATEGORIZED_ID }
        
        val groups = categories.groupBy { it.name.lowercase(Locale.ROOT).trim() to it.transactionType }
        
        groups.filter { it.value.size > 1 }.forEach { (_, group) ->
            val master = group.first()
            val duplicates = group.drop(1)
            
            duplicates.forEach { dup ->
                reassignCategoryExpenses(u, fromCategoryId = dup.id, toCategoryId = master.id)
                catDoc(u, dup.id).delete().await()
            }
        }
        
        // Repair missing sortOrder fields on remaining categories
        val remaining = catCol(u).get().await()
        remaining.documents.forEachIndexed { index, doc ->
            if (!doc.contains("sortOrder")) {
                doc.reference.update("sortOrder", index).await()
            }
        }
    }

    // ── Categories ──

    val allCategories: Flow<List<Category>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = catCol(u).orderBy("sortOrder").addSnapshotListener { snap, _ ->
            if (snap != null) {
                trySend(snap.documents.mapNotNull { doc -> categoryFromDoc(doc) })
            }
        }
        awaitClose { sub.remove() }
    }

    suspend fun insertCategory(category: Category): String {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val id = UUID.randomUUID().toString()
        val c = category.copy(id = id)
        catDoc(u, id).set(categoryPayload(c)).await()
        return id
    }

    suspend fun updateCategory(category: Category) {
        val u = uid() ?: return
        catDoc(u, category.id).set(categoryPayload(category), SetOptions.merge()).await()
    }

    suspend fun deleteCategory(category: Category) {
        val u = uid() ?: return
        if (category.id == UNCATEGORIZED_ID) return
        // SECURE: Move orphaned expenses to "Uncategorized" (match string + legacy numeric ids)
        ensureUncategorizedCategory(u)
        reassignCategoryExpenses(u, fromCategoryId = category.id, toCategoryId = UNCATEGORIZED_ID)
        catDoc(u, category.id).delete().await()
    }

    // ── Expenses ──

    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val q = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", startMillis)
            .whereLessThan("dateMillis", endMillis)
            .orderBy("dateMillis", Query.Direction.DESCENDING)
        val sub = q.addSnapshotListener { snap, _ ->
            if (snap != null) {
                trySend(snap.documents.mapNotNull { doc -> expenseFromDoc(doc) })
            }
        }
        awaitClose { sub.remove() }
    }

    suspend fun insertExpense(expense: Expense): String {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val id = if (expense.id.isBlank()) UUID.randomUUID().toString() else expense.id
        val e = expense.copy(id = id, amount = roundAmount(expense.amount))
        expDoc(u, id).set(expensePayload(e)).await()
        return id
    }

    suspend fun updateExpense(expense: Expense) {
        val u = uid() ?: return
        val prevSnap = expDoc(u, expense.id).get().await()
        val prevPath = prevSnap.getString("receiptImagePath")
        val e = expense.copy(amount = roundAmount(expense.amount))
        expDoc(u, expense.id).set(expensePayload(e), SetOptions.merge()).await()
        if (prevPath != expense.receiptImagePath) {
            purgeReceiptIfUnreferenced(prevPath, excludeExpenseId = expense.id)
        }
    }

    suspend fun deleteExpense(expense: Expense) {
        val u = uid() ?: return
        expDoc(u, expense.id).delete().await()
    }

    suspend fun duplicateExpense(expense: Expense) {
        val copiedReceipt = ReceiptFileUtils.copyReceipt(appContext, expense.receiptImagePath)
        insertExpense(expense.copy(id = "", dateMillis = System.currentTimeMillis(), receiptImagePath = copiedReceipt))
    }

    suspend fun sumMonthExpenses(excludeExpenseId: String = ""): Double {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: return 0.0
        val u = uid() ?: return 0.0
        val snap = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", range.first)
            .whereLessThan("dateMillis", range.second)
            .whereEqualTo("transactionType", "expense")
            .get().await()
        val rawSum = snap.documents
            .filter { it.id != excludeExpenseId }
            .sumOf { it.getDouble("amount") ?: 0.0 }
        return roundAmount(rawSum)
    }

    val allExpenses: Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = expCol(u).orderBy("dateMillis", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, _ ->
                if (snap != null) trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
            }
        awaitClose { sub.remove() }
    }

    val expensesRevision: Flow<Unit> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(Unit); close(); return@callbackFlow }
        val sub = expCol(u).addSnapshotListener { _, _ -> trySend(Unit) }
        awaitClose { sub.remove() }
    }

    suspend fun countExpensesForCategory(categoryId: String): Int {
        val u = uid() ?: return 0
        return expenseDocsForCategory(u, categoryId).size
    }

    suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String) {
        val u = uid() ?: return
        val docs = expenseDocsForCategory(u, categoryId)
        docs.chunked(450).forEach { chunk ->
            firestore.runBatch { batch ->
                chunk.forEach { doc ->
                    batch.update(doc.reference, "transactionType", transactionType)
                }
            }.await()
        }
    }

    suspend fun purgeReceiptIfUnreferenced(path: String?, excludeExpenseId: String = "") {
        if (path.isNullOrBlank()) return
        val u = uid() ?: return
        val snap = expCol(u).whereEqualTo("receiptImagePath", path).get().await()
        val count = snap.documents.count { it.id != excludeExpenseId }
        if (count == 0) ReceiptFileUtils.deleteIfStored(appContext, path)
    }

    fun queryExpenses(params: ExpenseQueryParams): Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        var q: Query = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", params.startMillis)
            .whereLessThan("dateMillis", params.endMillis)
            .orderBy("dateMillis", Query.Direction.DESCENDING)
        if (params.typeFilter.isNotEmpty()) q = q.whereEqualTo("transactionType", params.typeFilter)
        val sub = q.addSnapshotListener { snap, _ ->
            if (snap != null) trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
        }
        awaitClose { sub.remove() }
    }

    // ── Helpers ──

    private fun roundAmount(amount: Double): Double = round(amount * 100.0) / 100.0

    /**
     * Firestore equality is type-sensitive. Older Android builds stored categoryId as a number;
     * UUID migration stores strings. Match both so delete/dedupe never miss legacy rows.
     */
    private suspend fun expenseDocsForCategory(u: String, categoryId: String): List<DocumentSnapshot> {
        val byString = expCol(u).whereEqualTo("categoryId", categoryId).get().await().documents
        val byNumber = categoryId.toLongOrNull()?.let { n ->
            expCol(u).whereEqualTo("categoryId", n).get().await().documents
        }.orEmpty()
        return (byString + byNumber).distinctBy { it.id }
    }

    private suspend fun reassignCategoryExpenses(u: String, fromCategoryId: String, toCategoryId: String) {
        val docs = expenseDocsForCategory(u, fromCategoryId)
        docs.chunked(450).forEach { chunk ->
            firestore.runBatch { batch ->
                chunk.forEach { doc ->
                    batch.update(doc.reference, "categoryId", toCategoryId)
                }
            }.await()
        }
    }

    private suspend fun ensureUncategorizedCategory(u: String) {
        val ref = catDoc(u, UNCATEGORIZED_ID)
        if (ref.get().await().exists()) return
        val uncategorized = Category(
            id = UNCATEGORIZED_ID,
            name = "Uncategorized",
            iconName = "help_outline",
            colorInt = 0xff8e8e96.toInt(),
            transactionType = "expense",
            sortOrder = 999,
        )
        ref.set(categoryPayload(uncategorized)).await()
    }

    private fun categoryFromDoc(doc: DocumentSnapshot): Category? {
        return Category(
            id = doc.id,
            name = doc.getString("name") ?: "",
            iconName = doc.getString("iconName") ?: "shopping_bag",
            colorInt = (doc.getLong("colorInt") ?: 0xff6a9fd4).toInt(),
            transactionType = doc.getString("transactionType") ?: "expense",
            sortOrder = (doc.getLong("sortOrder") ?: 0).toInt()
        )
    }

    private fun expenseFromDoc(doc: com.google.firebase.firestore.DocumentSnapshot): Expense? {
        val categoryId = when (val raw = doc.get("categoryId")) {
            is String -> raw
            is Number -> raw.toLong().toString()
            else -> UNCATEGORIZED_ID
        }
        return Expense(
            id = doc.id,
            amount = doc.getDouble("amount") ?: 0.0,
            dateMillis = doc.getLong("dateMillis") ?: 0L,
            categoryId = categoryId,
            note = doc.getString("note") ?: "",
            receiptImagePath = doc.getString("receiptImagePath"),
            transactionType = doc.getString("transactionType") ?: "expense",
        )
    }

    private fun categoryPayload(c: Category) = mapOf(
        "name" to c.name, "iconName" to c.iconName, "colorInt" to c.colorInt.toLong(),
        "transactionType" to c.transactionType, "sortOrder" to c.sortOrder,
        "updatedAt" to System.currentTimeMillis()
    )

    private fun expensePayload(e: Expense) = mapOf(
        "amount" to e.amount, "dateMillis" to e.dateMillis, "categoryId" to e.categoryId,
        "note" to e.note, "receiptImagePath" to e.receiptImagePath,
        "transactionType" to e.transactionType, "updatedAt" to System.currentTimeMillis()
    )
}
