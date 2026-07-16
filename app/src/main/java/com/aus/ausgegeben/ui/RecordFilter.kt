package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Expense
import java.util.Locale

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
    categoryNames: Map<String, String> = emptyMap()
): List<Expense> {
    val q = query.trim().lowercase(Locale.ROOT)
    if (q.isEmpty()) return this
    return filter { expense ->
        expense.note.lowercase(Locale.ROOT).contains(q) ||
            expense.amount.toString().contains(q) ||
            expense.transactionType.contains(q) ||
            categoryNames[expense.categoryId]?.lowercase(Locale.ROOT)?.contains(q) == true
    }
}
