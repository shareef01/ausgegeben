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
            categoryNames[expense.categoryId]?.lowercase(Locale.ROOT)?.contains(q) == true
    }
}

fun List<Expense>.filterByCategory(
    categoryId: String?
): List<Expense> {
    if (categoryId.isNullOrEmpty()) return this
    return filter { it.categoryId == categoryId }
}


enum class RecordSort { DATE_DESC, DATE_ASC, AMOUNT_DESC, AMOUNT_ASC }

data class CompositeRecordFilter(
    val categoryIds: Set<String> = emptySet(),
    val minInput: String = "",
    val maxInput: String = "",
    val sort: RecordSort = RecordSort.DATE_DESC,
) {
    fun bounds(currency: String): Pair<Long?, Long?>? {
        fun parse(input: String): Long? = input.trim().takeIf { Regex("[0-9]+([.,][0-9]{1,2})?").matches(it) }
            ?.let { com.aus.ausgegeben.util.CurrencyUtils.parseAmount(it, currency) }
            ?.takeIf { it.isFinite() && it >= 0 }?.let { com.aus.ausgegeben.util.CurrencyUtils.toMinorUnits(it) }
            ?.takeIf { it <= 9_007_199_254_740_991L }
        val min = if (minInput.isBlank()) null else parse(minInput) ?: return null
        val max = if (maxInput.isBlank()) null else parse(maxInput) ?: return null
        if (min != null && max != null && min > max) return null
        return min to max
    }
    val activeCount: Int get() = (if (categoryIds.isEmpty()) 0 else 1) +
        (if (minInput.isBlank() && maxInput.isBlank()) 0 else 1) + (if (sort == RecordSort.DATE_DESC) 0 else 1)
}

fun filterRecords(expenses: List<Expense>, query: String, type: TransactionTypeFilter,
    filter: CompositeRecordFilter, categoryNames: Map<String, String>, currency: String): List<Expense> {
    val (min, max) = filter.bounds(currency) ?: return emptyList()
    val matched = expenses.filter { e ->
        val amount = com.aus.ausgegeben.util.CurrencyUtils.toMinorUnits(e.amount)
        type.matches(e) && (filter.categoryIds.isEmpty() || e.categoryId in filter.categoryIds) &&
            (min == null || amount >= min) && (max == null || amount <= max)
    }.filterByQuery(query, categoryNames)
    val dateDesc = compareByDescending<Expense> { it.dateMillis }.thenBy { it.id }
    return matched.sortedWith(when (filter.sort) {
        RecordSort.DATE_DESC -> dateDesc
        RecordSort.DATE_ASC -> compareBy<Expense> { it.dateMillis }.thenBy { it.id }
        RecordSort.AMOUNT_DESC -> compareByDescending<Expense> { com.aus.ausgegeben.util.CurrencyUtils.toMinorUnits(it.amount) }.then(dateDesc)
        RecordSort.AMOUNT_ASC -> compareBy<Expense> { com.aus.ausgegeben.util.CurrencyUtils.toMinorUnits(it.amount) }.then(dateDesc)
    })
}
