package com.aus.ausgegeben.sync

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

data class CloudCategory(
    val category: Category,
    val deleted: Boolean = false,
)

data class CloudExpense(
    val expense: Expense,
    val deleted: Boolean = false,
)

class CloudSyncRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun categoriesRef(uid: String) =
        firestore.collection("users").document(uid).collection("categories")

    private fun expensesRef(uid: String) =
        firestore.collection("users").document(uid).collection("expenses")

    private fun preferencesRef(uid: String) =
        firestore.collection("users").document(uid).collection("preferences").document("settings")

    private fun now(): Long = System.currentTimeMillis()

    suspend fun pushCategory(uid: String, category: Category) {
        if (category.id == 0L) return
        val updatedAt = category.updatedAt.takeIf { it > 0L } ?: now()
        categoriesRef(uid).document(category.id.toString()).set(
            categoryPayload(category, updatedAt),
            SetOptions.merge(),
        ).await()
    }

    suspend fun pushExpense(uid: String, expense: Expense) {
        if (expense.id == 0L) return
        val updatedAt = expense.updatedAt.takeIf { it > 0L } ?: now()
        expensesRef(uid).document(expense.id.toString()).set(
            expensePayload(expense, updatedAt),
            SetOptions.merge(),
        ).await()
    }

    suspend fun tombstoneCategory(uid: String, id: Long) {
        categoriesRef(uid).document(id.toString()).set(
            mapOf("deleted" to true, "updatedAt" to now()),
            SetOptions.merge(),
        ).await()
    }

    suspend fun tombstoneExpense(uid: String, id: Long) {
        expensesRef(uid).document(id.toString()).set(
            mapOf("deleted" to true, "updatedAt" to now()),
            SetOptions.merge(),
        ).await()
    }

    suspend fun pullCategories(uid: String): List<CloudCategory> {
        val snap = categoriesRef(uid).get().await()
        return snap.documents.mapNotNull { doc ->
            val id = doc.id.toLongOrNull() ?: return@mapNotNull null
            CloudCategory(parseCategory(id, doc.data ?: emptyMap()), doc.getBoolean("deleted") == true)
        }
    }

    suspend fun pullExpenses(uid: String): List<CloudExpense> {
        val snap = expensesRef(uid).get().await()
        return snap.documents.mapNotNull { doc ->
            val id = doc.id.toLongOrNull() ?: return@mapNotNull null
            CloudExpense(parseExpense(id, doc.data ?: emptyMap()), doc.getBoolean("deleted") == true)
        }
    }

    suspend fun pushPreferences(uid: String, prefs: SyncedPreferences) {
        preferencesRef(uid).set(
            mapOf(
                "currency" to prefs.currency,
                "locale" to prefs.locale,
                "themeMode" to prefs.themeMode,
                "dailyReminder" to prefs.dailyReminder,
                "reminderHour" to prefs.reminderHour,
                "reminderMinute" to prefs.reminderMinute,
                "analyticsPeriod" to prefs.analyticsPeriod,
                "monthlyBudget" to prefs.monthlyBudget,
                "updatedAt" to prefs.updatedAt,
            ),
            SetOptions.merge(),
        ).await()
    }

    suspend fun pullPreferences(uid: String): SyncedPreferences? {
        val snap = preferencesRef(uid).get().await()
        if (!snap.exists()) return null
        val data = snap.data ?: return null
        return SyncedPreferences(
            currency = data["currency"] as? String ?: "EUR",
            locale = data["locale"] as? String ?: "en",
            themeMode = data["themeMode"] as? String ?: "system",
            dailyReminder = data["dailyReminder"] as? Boolean ?: true,
            reminderHour = (data["reminderHour"] as? Number)?.toInt() ?: 19,
            reminderMinute = (data["reminderMinute"] as? Number)?.toInt() ?: 0,
            analyticsPeriod = data["analyticsPeriod"] as? String ?: "this_month",
            monthlyBudget = (data["monthlyBudget"] as? Number)?.toDouble(),
            updatedAt = (data["updatedAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    suspend fun pushAll(uid: String, categories: List<Category>, expenses: List<Expense>) {
        categories.filter { it.id != 0L }.forEach { pushCategory(uid, it) }
        expenses.filter { it.id != 0L }.forEach { pushExpense(uid, it) }
    }

    private fun categoryPayload(category: Category, updatedAt: Long, deleted: Boolean = false) = mapOf(
        "name" to category.name,
        "iconName" to category.iconName,
        "colorInt" to category.colorInt.toLong(),
        "transactionType" to category.transactionType,
        "sortOrder" to category.sortOrder,
        "updatedAt" to updatedAt,
        "deleted" to deleted,
    )

    private fun expensePayload(expense: Expense, updatedAt: Long, deleted: Boolean = false) = mapOf(
        "amount" to expense.amount,
        "dateMillis" to expense.dateMillis,
        "categoryId" to expense.categoryId,
        "note" to expense.note,
        "receiptImagePath" to expense.receiptImagePath,
        "transactionType" to expense.transactionType,
        "updatedAt" to updatedAt,
        "deleted" to deleted,
    )

    private fun parseCategory(id: Long, data: Map<String, Any?>): Category = Category(
        id = id,
        name = data["name"] as? String ?: "",
        iconName = data["iconName"] as? String ?: "shopping_bag",
        colorInt = (data["colorInt"] as? Number)?.toInt() ?: 0xff6a9fd4.toInt(),
        transactionType = data["transactionType"] as? String ?: "expense",
        sortOrder = (data["sortOrder"] as? Number)?.toInt() ?: 0,
        updatedAt = (data["updatedAt"] as? Number)?.toLong() ?: 0L,
    )

    private fun parseExpense(id: Long, data: Map<String, Any?>): Expense = Expense(
        id = id,
        amount = (data["amount"] as? Number)?.toDouble() ?: 0.0,
        dateMillis = (data["dateMillis"] as? Number)?.toLong() ?: 0L,
        categoryId = (data["categoryId"] as? Number)?.toLong() ?: 0L,
        note = data["note"] as? String ?: "",
        receiptImagePath = data["receiptImagePath"] as? String,
        transactionType = data["transactionType"] as? String ?: "expense",
        updatedAt = (data["updatedAt"] as? Number)?.toLong()
            ?: (data["dateMillis"] as? Number)?.toLong()
            ?: 0L,
    )
}
