package com.aus.ausgegeben.data

import android.content.Context
import android.util.Log
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.dateRangeMillis
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
        private const val TAG = "AppRepository"
    }

    // Guards ensureSeeded() so two concurrent callers (e.g. AuthViewModel right after
    // sign-in and MainActivity's post-auth-gateway LaunchedEffect) can't both observe an
    // empty categories collection and both batch-insert the default set.
    private val ensureSeededMutex = Mutex()

    private val _listenerError = MutableStateFlow<String?>(null)
    /**
     * Non-null when a Firestore realtime listener (currently `allExpenses` / `queryExpenses`,
     * the most user-visible ones) most recently failed, so callers can tell "genuinely empty"
     * apart from "listener broke" — cleared as soon as a listener emits data successfully again.
     * Surfaced as a snackbar in MainActivity.kt.
     */
    val listenerError: StateFlow<String?> = _listenerError.asStateFlow()

    private fun uid(): String? = authRepository.currentUserId

    /** Restarts the given listener flow whenever the signed-in user changes. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun <T> perUserFlow(signedOutValue: T, build: (String) -> Flow<T>): Flow<T> =
        authRepository.authState
            .map { it?.uid }
            .distinctUntilChanged()
            .flatMapLatest { u -> if (u == null) flowOf(signedOutValue) else build(u) }

    private fun catCol(uid: String) = firestore.collection("users").document(uid).collection("categories")
    private fun expCol(uid: String) = firestore.collection("users").document(uid).collection("expenses")
    private fun metaCol(uid: String) = firestore.collection("users").document(uid).collection("meta")
    private fun catDoc(uid: String, id: String) = catCol(uid).document(id)
    private fun expDoc(uid: String, id: String) = expCol(uid).document(id)
    private fun dedupeMarkerDoc(uid: String) = metaCol(uid).document("dedupe")

    suspend fun ensureSeeded() {
        ensureSeededMutex.withLock {
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
                firestore.runBatch { batch ->
                    defaults.forEach { c ->
                        batch.set(catDoc(u, c.id), categoryPayload(c))
                    }
                }.await()
            } else {
                // SECURE: dedupe is expensive (full category-collection reads); only run it once per
                // account instead of on every cold start / sign-in. Manual calls to
                // deduplicateCategories() (e.g. Settings' "Deduplicate categories" button) bypass this
                // marker entirely since they call the function directly, not through ensureSeeded().
                val markerSnap = dedupeMarkerDoc(u).get().await()
                if (markerSnap.getBoolean("categoriesDeduped") != true) {
                    deduplicateCategories()
                    dedupeMarkerDoc(u).set(
                        mapOf("categoriesDeduped" to true, "ranAt" to System.currentTimeMillis()),
                        SetOptions.merge()
                    ).await()
                }
            }
            ensureUncategorizedCategory(u)
        }
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

    val allCategories: Flow<List<Category>> = perUserFlow(emptyList()) { u ->
        callbackFlow {
            val sub = catCol(u).orderBy("sortOrder").addSnapshotListener { snap, error ->
                if (error != null) Log.w(TAG, "categories listener error", error)
                if (snap != null) {
                    trySend(snap.documents.mapNotNull { doc -> categoryFromDoc(doc) })
                }
            }
            awaitClose { sub.remove() }
        }
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

    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
        perUserFlow(emptyList()) { u ->
            callbackFlow {
                val q = expCol(u)
                    .whereGreaterThanOrEqualTo("dateMillis", startMillis)
                    .whereLessThan("dateMillis", endMillis)
                    .orderBy("dateMillis", Query.Direction.DESCENDING)
                val sub = q.addSnapshotListener { snap, error ->
                    if (error != null) Log.w(TAG, "expenses-in-range listener error", error)
                    if (snap != null) {
                        trySend(snap.documents.mapNotNull { doc -> expenseFromDoc(doc) })
                    }
                }
                awaitClose { sub.remove() }
            }
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
        val e = expense.copy(amount = roundAmount(expense.amount))
        expDoc(u, expense.id).set(expensePayload(e), SetOptions.merge()).await()
    }

    suspend fun deleteExpense(expense: Expense) {
        val u = uid() ?: return
        expDoc(u, expense.id).delete().await()
    }

    suspend fun duplicateExpense(expense: Expense) {
        insertExpense(expense.copy(id = "", dateMillis = System.currentTimeMillis()))
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

    val allExpenses: Flow<List<Expense>> = perUserFlow(emptyList()) { u ->
        callbackFlow {
            val sub = expCol(u).orderBy("dateMillis", Query.Direction.DESCENDING)
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        Log.w(TAG, "expenses listener error", error)
                        _listenerError.value = error.message ?: "expenses listener error"
                    }
                    if (snap != null) {
                        _listenerError.value = null
                        trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
                    }
                }
            awaitClose { sub.remove() }
        }
    }

    val expensesRevision: Flow<Unit> = perUserFlow(Unit) { u ->
        callbackFlow {
            val sub = expCol(u).addSnapshotListener { _, error ->
                if (error != null) Log.w(TAG, "expenses revision listener error", error)
                trySend(Unit)
            }
            awaitClose { sub.remove() }
        }
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

    fun queryExpenses(params: ExpenseQueryParams): Flow<List<Expense>> =
        perUserFlow(emptyList()) { u ->
            callbackFlow {
                var q: Query = expCol(u)
                    .whereGreaterThanOrEqualTo("dateMillis", params.startMillis)
                    .whereLessThan("dateMillis", params.endMillis)
                    .orderBy("dateMillis", Query.Direction.DESCENDING)
                if (params.typeFilter.isNotEmpty()) q = q.whereEqualTo("transactionType", params.typeFilter)
                val sub = q.addSnapshotListener { snap, error ->
                    if (error != null) {
                        Log.w(TAG, "query listener error", error)
                        _listenerError.value = error.message ?: "query listener error"
                    }
                    if (snap != null) {
                        _listenerError.value = null
                        trySend(snap.documents.mapNotNull { expenseFromDoc(it) })
                    }
                }
                awaitClose { sub.remove() }
            }
        }

    // ── Helpers ──

    private fun roundAmount(amount: Double): Double = round(amount * 100.0) / 100.0

    /**
     * Firestore equality is type-sensitive. Older Android builds stored categoryId as a number;
     * UUID migration stores strings. Match both so delete/dedupe never miss legacy rows.
     */
    private suspend fun expenseDocsForCategory(u: String, categoryId: String): List<DocumentSnapshot> = coroutineScope {
        val byStringDeferred = async { expCol(u).whereEqualTo("categoryId", categoryId).get().await().documents }
        val byNumberDeferred = async {
            categoryId.toLongOrNull()?.let { n ->
                expCol(u).whereEqualTo("categoryId", n).get().await().documents
            }.orEmpty()
        }
        (byStringDeferred.await() + byNumberDeferred.await()).distinctBy { it.id }
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
        "note" to e.note,
        "transactionType" to e.transactionType, "updatedAt" to System.currentTimeMillis()
    )
}
