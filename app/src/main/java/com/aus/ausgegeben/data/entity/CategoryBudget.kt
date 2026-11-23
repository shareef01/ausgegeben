package com.aus.ausgegeben.data.entity

import com.aus.ausgegeben.util.CurrencyUtils
import kotlin.math.abs
import kotlin.math.round

data class CategoryBudget(val categoryId: String, val monthlyLimit: Double, val warningThresholdPercent: Int = 80, val updatedAt: Long = System.currentTimeMillis()) {
    fun valid() = categoryId.isNotBlank() && categoryId.length <= 1500 && !categoryId.contains('/') && monthlyLimit.isFinite() && monthlyLimit > 0 && monthlyLimit < 1e9 && abs(monthlyLimit * 100 - round(monthlyLimit * 100)) < 0.0001 && warningThresholdPercent in 1..100 && updatedAt in 1..9_007_199_254_740_991L
    fun payload() = mapOf("monthlyLimit" to monthlyLimit, "warningThresholdPercent" to warningThresholdPercent, "updatedAt" to updatedAt)
}
data class CategoryBudgetProgress(
    val budget: CategoryBudget,
    val category: Category,
    /** Anticipated spend: actual + upcoming. Kept for the existing progress/state contract. */
    val spent: Double,
    val remaining: Double,
    val overspent: Double,
    val percent: Double,
    val state: String,
    /** Actual spending: rows dated before the supplied cutoff (defaults to `spent`). */
    val spentToDate: Double = spent,
    /** Future-dated spending for the reporting month: `spent - spentToDate`. */
    val upcoming: Double = 0.0,
    /** Explicit name for the anticipated total. */
    val anticipated: Double = spent,
)

fun categoryBudgetProgress(
    budgets: List<CategoryBudget>,
    categories: List<Category>,
    expenses: List<Expense>,
    /** Local-midnight start of tomorrow: rows at/after it are upcoming, not spent yet. */
    cutoffMillis: Long? = null,
): List<CategoryBudgetProgress> {
    val cats = categories.filter { it.transactionType == "expense" && it.migrationState == null }.associateBy { it.id }
    val spent = mutableMapOf<String, Long>()
    val spentToDate = mutableMapOf<String, Long>()
    expenses.filter { !it.deleted && it.transactionType == "expense" }.forEach {
        val minor = CurrencyUtils.toMinorUnits(it.amount)
        spent[it.categoryId] = (spent[it.categoryId] ?: 0L) + minor
        // Without a cutoff the historical contract applies: every supplied row is spent.
        if (cutoffMillis == null || it.dateMillis < cutoffMillis) {
            spentToDate[it.categoryId] = (spentToDate[it.categoryId] ?: 0L) + minor
        }
    }
    return budgets.mapNotNull { b -> cats[b.categoryId]?.let { c ->
        val limit = CurrencyUtils.toMinorUnits(b.monthlyLimit)
        val used = spent[b.categoryId] ?: 0L
        val actual = spentToDate[b.categoryId] ?: 0L
        CategoryBudgetProgress(
            budget = b,
            category = c,
            spent = used / 100.0,
            remaining = maxOf(0L, limit - used) / 100.0,
            overspent = maxOf(0L, used - limit) / 100.0,
            percent = used * 100.0 / limit,
            // Approved F-05 rule: actual over budget is red; actual within budget but
            // anticipated over is amber ("projected"); otherwise the existing thresholds.
            state = if (actual > limit) "over"
            else if (used > limit) "projected"
            else if (used == limit) "reached"
            else if (used * 100 >= limit * b.warningThresholdPercent) "warning"
            else "normal",
            spentToDate = actual / 100.0,
            upcoming = (used - actual) / 100.0,
            anticipated = used / 100.0,
        )
    } }.sortedWith(compareByDescending<CategoryBudgetProgress> { it.percent }.thenBy { it.budget.categoryId })
}
data class BudgetAllocation(val total: Double, val unallocated: Double?, val overAllocated: Double)
fun budgetAllocation(budgets: List<CategoryBudget>, global: Double?): BudgetAllocation {
    val total = budgets.sumOf { CurrencyUtils.toMinorUnits(it.monthlyLimit) }; val limit = global?.let { CurrencyUtils.toMinorUnits(it) }
    return BudgetAllocation(total/100.0,limit?.let { maxOf(0L,it-total)/100.0 }, limit?.let { maxOf(0L,total-it)/100.0 } ?: 0.0)
}
