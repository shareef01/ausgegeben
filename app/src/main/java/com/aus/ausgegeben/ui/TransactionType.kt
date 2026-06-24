package com.aus.ausgegeben.ui

import android.content.Context
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense

enum class TransactionType(val storageKey: String, val label: String) {
    EXPENSE("expense", "expense"),
    INCOME("income", "income"),
    TRANSFER("transfer", "transfer");

    companion object {
        fun fromKey(key: String): TransactionType =
            entries.find { it.storageKey == key } ?: EXPENSE
    }
}

object CategoryGroups {
    fun matches(type: TransactionType, category: Category): Boolean =
        category.transactionType == type.storageKey
}

fun Expense.isTransfer(): Boolean = transactionType == TransactionType.TRANSFER.storageKey

fun Expense.isIncome(): Boolean = transactionType == TransactionType.INCOME.storageKey

fun Expense.isExpense(): Boolean = transactionType == TransactionType.EXPENSE.storageKey

fun TransactionType.localizedLabel(context: Context): String = when (this) {
    TransactionType.EXPENSE -> context.getString(R.string.add_type_expense)
    TransactionType.INCOME -> context.getString(R.string.add_type_income)
    TransactionType.TRANSFER -> context.getString(R.string.add_type_transfer)
}
