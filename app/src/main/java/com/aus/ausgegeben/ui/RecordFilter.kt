package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Expense

enum class TransactionTypeFilter(val label: String) {
    ALL("All"),
    EXPENSE("Expense"),
    INCOME("Income"),
    TRANSFER("Transfer");

    fun matches(expense: Expense): Boolean = when (this) {
        ALL -> true
        EXPENSE -> expense.isExpense()
        INCOME -> expense.isIncome()
        TRANSFER -> expense.isTransfer()
    }
}

fun List<Expense>.filterByQuery(
    query: String,
    categoryNames: Map<Long, String> = emptyMap()
): List<Expense> {
    val q = query.trim().lowercase()
    if (q.isEmpty()) return this
    return filter { expense ->
        expense.note.lowercase().contains(q) ||
            expense.amount.toString().contains(q) ||
            expense.transactionType.contains(q) ||
            categoryNames[expense.categoryId]?.lowercase()?.contains(q) == true
    }
}
