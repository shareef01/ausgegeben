package com.aus.ausgegeben.ui

import android.content.Context
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Expense
import java.util.Locale

enum class TransactionTypeFilter {
    ALL,
    EXPENSE,
    INCOME,
    TRANSFER;

    fun matches(expense: Expense): Boolean = when (this) {
        ALL -> true
        EXPENSE -> expense.isExpense()
        INCOME -> expense.isIncome()
        TRANSFER -> expense.isTransfer()
    }
}

fun TransactionTypeFilter.localizedLabel(context: Context): String = when (this) {
    TransactionTypeFilter.ALL -> context.getString(R.string.filter_all)
    TransactionTypeFilter.EXPENSE -> context.getString(R.string.filter_expense)
    TransactionTypeFilter.INCOME -> context.getString(R.string.filter_income)
    TransactionTypeFilter.TRANSFER -> context.getString(R.string.filter_transfer)
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
