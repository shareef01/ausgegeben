package com.aus.ausgegeben.ui.designqa

import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import java.util.Calendar

/**
 * The "heavy" design-QA account, matching web/scripts/seed-qa-data.mjs: CHF, German
 * category names (one very long, several sharing a prefix), and six- to seven-digit
 * amounts. This month nets exactly 1.104.064,70 CHF, the total the web averages row
 * could not fit.
 */
object DesignQaFixtures {

    const val CURRENCY = "CHF"
    const val LONG_CATEGORY = "Haushaltsversicherung und Nebenkosten der Wohnung"

    val categories: List<Category> = listOf(
        Category(id = "q-house", name = LONG_CATEGORY, iconName = "home", colorInt = 0xff6a9fd4.toInt()),
        Category(id = "q-groc-aldi", name = "Lebensmittel – Discounter", iconName = "shopping_cart", colorInt = 0xffe86b5a.toInt()),
        Category(id = "q-groc-bio", name = "Lebensmittel – Biomarkt", iconName = "shopping_cart", colorInt = 0xffe8a060.toInt()),
        Category(id = "q-car", name = "Auto", iconName = "car", colorInt = 0xff9a8fd4.toInt()),
        Category(id = "q-edu", name = "Weiterbildung", iconName = "school", colorInt = 0xff8fb35a.toInt()),
        Category(id = "q-salary", name = "Gehalt", iconName = "credit_card", colorInt = 0xff5cb88a.toInt(), transactionType = "income"),
        Category(id = "q-sale", name = "Immobilienverkauf", iconName = "home", colorInt = 0xff6ad4a0.toInt(), transactionType = "income"),
        Category(id = "q-transfer", name = "Umbuchung Sparkonto", iconName = "swap_horiz", colorInt = 0xff8e8e96.toInt(), transactionType = "transfer"),
    ).mapIndexed { i, c -> c.copy(sortOrder = i) }

    /** Rows for this month and the five before it, dated relative to now. */
    val expenses: List<Expense> by lazy {
        val rows = mutableListOf<Expense>()
        fun add(monthsAgo: Int, day: Int, amount: Double, categoryId: String, note: String, type: String = "expense") {
            val cal = Calendar.getInstance().apply {
                add(Calendar.MONTH, -monthsAgo)
                val today = if (monthsAgo == 0) Calendar.getInstance().get(Calendar.DAY_OF_MONTH) else getActualMaximum(Calendar.DAY_OF_MONTH)
                set(Calendar.DAY_OF_MONTH, day.coerceAtMost(today))
                set(Calendar.HOUR_OF_DAY, 12)
            }
            rows += Expense(
                id = "qa-$monthsAgo-$day-$categoryId-${rows.size}",
                amount = amount,
                dateMillis = cal.timeInMillis,
                categoryId = categoryId,
                note = note,
                transactionType = type,
            )
        }
        // This month: 1.250.000,00 in, 145.935,30 out → net 1.104.064,70 CHF.
        add(0, 1, 1_250_000.00, "q-sale", "Verkauf Ferienwohnung", "income")
        add(0, 1, 123_456.70, "q-house", "Sehr lange Notiz, um zu prüfen, ob die Zeile auf schmalen Geräten sauber umbricht")
        add(0, 1, 18_765.40, "q-car", "")
        add(0, 1, 3_713.20, "q-groc-aldi", "Wocheneinkauf")
        add(0, 1, 50_000.00, "q-transfer", "Sparkonto", "transfer")
        for (m in 1..5) {
            add(m, 1, 9_876.50, "q-salary", "Gehalt", "income")
            add(m, 3, 2_345.60 * m, "q-house", "")
            add(m, 9, 1_234_567.89 / (m + 1), "q-groc-bio", "")
            add(m, 15, 412.35, "q-edu", "")
        }
        rows
    }
}

class QaCategoryActions(list: List<Category>) : CategoryActions {
    override val allCategories: Flow<List<Category>> = MutableStateFlow(list)
    override suspend fun insertCategory(category: Category) = Result.success(category.id)
    override suspend fun updateCategory(category: Category) = Result.success(Unit)
    override suspend fun updateCategoriesBatch(categories: List<Category>) = Result.success(Unit)
    override suspend fun deleteCategory(category: Category) = Result.success(Unit)
    override suspend fun deduplicateCategories() = Result.success(Unit)
    override suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String) = Result.success(Unit)
    override suspend fun countExpensesForCategory(categoryId: String) = 0
}

class QaExpenseActions(private val list: List<Expense>) : ExpenseActions {
    override val allExpenses: Flow<List<Expense>> = MutableStateFlow(list)
    override val dataTruncated = MutableStateFlow(false)
    override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
        flowOf(list.filter { it.dateMillis in startMillis..endMillis })
    override suspend fun insertExpense(expense: Expense, idempotencyKey: String?) = Result.success(expense.id)
    override suspend fun updateExpense(expense: Expense) = Result.success(Unit)
    override suspend fun deleteExpense(expense: Expense) = Result.success(Unit)
    override suspend fun duplicateExpense(expense: Expense) = Result.success(Unit)
    override suspend fun sumMonthExpenses(excludeExpenseId: String) = 0.0
}

class QaPreferences(currency: String, budget: Double?) : TransactionPreferences {
    override val currencyFlow: Flow<String> = MutableStateFlow(currency)
    override val monthlyBudgetFlow: Flow<Double?> = MutableStateFlow(budget)
    override val analyticsPeriodFlow = MutableStateFlow("this_month")
    override suspend fun updateAnalyticsPeriodKey(storageKey: String) {
        analyticsPeriodFlow.value = storageKey
    }
}
