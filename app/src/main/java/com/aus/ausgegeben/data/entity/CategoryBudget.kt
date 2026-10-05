package com.aus.ausgegeben.data.entity

import com.aus.ausgegeben.util.CurrencyUtils
import kotlin.math.abs
import kotlin.math.round

data class CategoryBudget(val categoryId: String, val monthlyLimit: Double, val warningThresholdPercent: Int = 80, val updatedAt: Long = System.currentTimeMillis()) {
    fun valid() = categoryId.isNotBlank() && categoryId.length <= 1500 && !categoryId.contains('/') && monthlyLimit.isFinite() && monthlyLimit > 0 && monthlyLimit < 1e9 && abs(monthlyLimit * 100 - round(monthlyLimit * 100)) < 0.0001 && warningThresholdPercent in 1..100 && updatedAt in 1..9_007_199_254_740_991L
    fun payload() = mapOf("monthlyLimit" to monthlyLimit, "warningThresholdPercent" to warningThresholdPercent, "updatedAt" to updatedAt)
}
data class CategoryBudgetProgress(val budget: CategoryBudget, val category: Category, val spent: Double, val remaining: Double, val overspent: Double, val percent: Double, val state: String)
fun categoryBudgetProgress(budgets: List<CategoryBudget>, categories: List<Category>, expenses: List<Expense>): List<CategoryBudgetProgress> {
    val cats = categories.filter { it.transactionType == "expense" && it.migrationState == null }.associateBy { it.id }
    val spent = mutableMapOf<String, Long>()
    expenses.filter { !it.deleted && it.transactionType == "expense" }.forEach { spent[it.categoryId] = (spent[it.categoryId] ?: 0L) + CurrencyUtils.toMinorUnits(it.amount) }
    return budgets.mapNotNull { b -> cats[b.categoryId]?.let { c ->
        val limit = CurrencyUtils.toMinorUnits(b.monthlyLimit); val used = spent[b.categoryId] ?: 0L
        CategoryBudgetProgress(b,c,used/100.0, maxOf(0L,limit-used)/100.0, maxOf(0L,used-limit)/100.0,used*100.0/limit,
            if (used>limit) "over" else if (used==limit) "reached" else if (used*100 >= limit*b.warningThresholdPercent) "warning" else "normal")
    } }.sortedWith(compareByDescending<CategoryBudgetProgress> { it.percent }.thenBy { it.budget.categoryId })
}
data class BudgetAllocation(val total: Double, val unallocated: Double?, val overAllocated: Double)
fun budgetAllocation(budgets: List<CategoryBudget>, global: Double?): BudgetAllocation {
    val total = budgets.sumOf { CurrencyUtils.toMinorUnits(it.monthlyLimit) }; val limit = global?.let { CurrencyUtils.toMinorUnits(it) }
    return BudgetAllocation(total/100.0,limit?.let { maxOf(0L,it-total)/100.0 }, limit?.let { maxOf(0L,total-it)/100.0 } ?: 0.0)
}
