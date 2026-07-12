package com.aus.ausgegeben.data

import android.content.Context
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.aus.ausgegeben.util.repairStoredCategoryColor
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class AppRepository(
    private val appContext: Context,
    private val authRepository: AuthRepository,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    companion object {
        private const val PAGE_SIZE = 30
    }

    private fun uid(): String? = authRepository.currentUserId

    private fun catCol(uid: String) = firestore.collection("users").document(uid).collection("categories")
    private fun expCol(uid: String) = firestore.collection("users").document(uid).collection("expenses")
    private fun catDoc(uid: String, id: Long) = catCol(uid).document(id.toString())
    private fun expDoc(uid: String, id: Long) = expCol(uid).document(id.toString())

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
            defaults.forEachIndexed { i, c ->
                catCol(u).document((i + 1).toString()).set(mapOf(
                    "name" to c.name, "iconName" to c.iconName, "colorInt" to c.colorInt.toLong(),
                    "transactionType" to c.transactionType, "sortOrder" to c.sortOrder,
                    "updatedAt" to System.currentTimeMillis()
                )).await()
            }
        }
    }

    // ── Categories ──

    val allCategories: Flow<List<Category>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = catCol(u).orderBy("sortOrder").addSnapshotListener { snap, _ ->
            if (snap != null) {
                trySend(snap.documents.mapNotNull { doc ->
                    val id = doc.id.toLongOrNull() ?: return@mapNotNull null
                    Category(id = id, name = doc.getString("name") ?: "",
                        iconName = doc.getString("iconName") ?: "shopping_bag",
                        colorInt = (doc.getLong("colorInt") ?: 0xff6a9fd4).toInt(),
                        transactionType = doc.getString("transactionType") ?: "expense",
                        sortOrder = (doc.getLong("sortOrder") ?: 0).toInt())
                })
            }
        }
        awaitClose { sub.remove() }
    }

    suspend fun insertCategory(category: Category): Long {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val id = nextId(u, "categories")
        catDoc(u, id).set(categoryPayload(category)).await()
        return id
    }

    suspend fun updateCategory(category: Category) {
        val u = uid() ?: return
        catDoc(u, category.id).set(categoryPayload(category), SetOptions.merge()).await()
    }

    suspend fun deleteCategory(category: Category) {
        val u = uid() ?: return
        // Delete linked expenses
        val linked = expCol(u).whereEqualTo("categoryId", category.id).get().await()
        linked.documents.forEach { it.reference.delete().await() }
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

    fun getMonthExpenses(): Flow<List<Expense>> {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis()
            ?: return callbackFlow { trySend(emptyList()); close() }
        return getExpensesInRange(range.first, range.second)
    }

    suspend fun insertExpense(expense: Expense): Long {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val id = nextId(u, "expenses")
        expDoc(u, id).set(expensePayload(expense)).await()
        return id
    }

    suspend fun updateExpense(expense: Expense) {
        val u = uid() ?: return
        val prevSnap = expDoc(u, expense.id).get().await()
        val prevPath = prevSnap.getString("receiptImagePath")
        expDoc(u, expense.id).set(expensePayload(expense), SetOptions.merge()).await()
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
        insertExpense(expense.copy(id = 0L, dateMillis = System.currentTimeMillis(), receiptImagePath = copiedReceipt))
    }

    suspend fun sumMonthExpenses(excludeExpenseId: Long = 0L): Double {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: return 0.0
        val u = uid() ?: return 0.0
        val snap = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", range.first)
            .whereLessThan("dateMillis", range.second)
            .whereEqualTo("transactionType", "expense")
            .get().await()
        return snap.documents.sumOf { it.getDouble("amount") ?: 0.0 }
    }

    fun getAllExpenses(pageSize: Int = PAGE_SIZE): Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = expCol(u).orderBy("dateMillis", Query.Direction.DESCENDING).limit(pageSize.toLong())
            .addSnapshotListener { snap, _ ->
                if (snap != null) trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
            }
        awaitClose { sub.remove() }
    }

    // ── Aggregated Flows (for ViewModel consumption) ──

    val allExpenses: Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = expCol(u).orderBy("dateMillis", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, _ ->
                if (snap != null) trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
            }
        awaitClose { sub.remove() }
    }

    // Simple revision signal — emits Unit on every expense change
    val expensesRevision: Flow<Unit> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(Unit); close(); return@callbackFlow }
        val sub = expCol(u).addSnapshotListener { _, _ -> trySend(Unit) }
        awaitClose { sub.remove() }
    }

    fun getExpensesByCategory(categoryId: Long): Flow<List<Expense>> = callbackFlow {
        val u = uid()
        if (u == null) { trySend(emptyList()); close(); return@callbackFlow }
        val sub = expCol(u).whereEqualTo("categoryId", categoryId).orderBy("dateMillis", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, _ ->
                if (snap != null) trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
            }
        awaitClose { sub.remove() }
    }

    suspend fun getAllExpensesOnce(): List<Expense> {
        val u = uid() ?: return emptyList()
        return expCol(u).orderBy("dateMillis", Query.Direction.DESCENDING).get().await()
            .documents.mapNotNull { expenseFromDoc(it) }
    }

    suspend fun getAllCategoriesOnce(): List<Category> {
        val u = uid() ?: return emptyList()
        return catCol(u).orderBy("sortOrder").get().await()
            .documents.mapNotNull { doc ->
                val id = doc.id.toLongOrNull() ?: return@mapNotNull null
                Category(id = id, name = doc.getString("name") ?: "",
                iconName = doc.getString("iconName") ?: "shopping_bag",
                colorInt = (doc.getLong("colorInt") ?: 0xff6a9fd4).toInt(),
                transactionType = doc.getString("transactionType") ?: "expense",
                sortOrder = (doc.getLong("sortOrder") ?: 0).toInt()) }
    }

    suspend fun countExpensesForCategory(categoryId: Long): Int {
        val u = uid() ?: return 0
        return expCol(u).whereEqualTo("categoryId", categoryId).get().await().size()
    }

    suspend fun updateExpenseTypesForCategory(categoryId: Long, transactionType: String) {
        val u = uid() ?: return
        val snap = expCol(u).whereEqualTo("categoryId", categoryId).get().await()
        for (doc in snap.documents) {
            val docId = doc.id.toLongOrNull() ?: continue
            expDoc(u, docId).set(mapOf("transactionType" to transactionType), SetOptions.merge()).await()
        }
    }

    suspend fun purgeReceiptIfUnreferenced(path: String?, excludeExpenseId: Long = 0L) {
        if (path.isNullOrBlank()) return
        val u = uid() ?: return
        val snap = expCol(u).whereEqualTo("receiptImagePath", path).get().await()
        val count = snap.documents.count { it.id.toLongOrNull() != excludeExpenseId }
        if (count == 0) ReceiptFileUtils.deleteIfStored(appContext, path)
    }

    // Simple query flow — replaces Room paging
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

    private suspend fun nextId(uid: String, kind: String): Long {
        val counterRef = firestore.collection("users").document(uid).collection("_counters").document(kind)
        return firestore.runTransaction<Long> { tx ->
            val snap = tx.get(counterRef)
            val current = snap.getLong("value") ?: 0L
            val next = current + 1
            tx.set(counterRef, mapOf("value" to next), SetOptions.merge())
            next
        }.await()
    }

    private fun expenseFromDoc(doc: com.google.firebase.firestore.DocumentSnapshot): Expense? {
        val id = doc.id.toLongOrNull() ?: return null
        return Expense(
            id = id,
            amount = doc.getDouble("amount") ?: 0.0,
            dateMillis = doc.getLong("dateMillis") ?: 0L,
            categoryId = doc.getLong("categoryId") ?: 0L,
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
