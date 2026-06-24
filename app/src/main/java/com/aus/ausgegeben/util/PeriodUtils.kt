package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.isExpense
import com.aus.ausgegeben.ui.isIncome
import com.aus.ausgegeben.ui.isTransfer
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

enum class RecordListPeriod(val label: String) {
    THIS_MONTH("This month"),
    ALL_TIME("All time")
}

enum class AnalyticsPeriod(val label: String, val storageKey: String) {
    THIS_MONTH("This month", "this_month"),
    LAST_MONTH("Last month", "last_month"),
    ALL_TIME("All time", "all_time");

    companion object {
        fun fromStorageKey(key: String?): AnalyticsPeriod =
            entries.find { it.storageKey == key } ?: THIS_MONTH
    }
}

/** Inclusive start, exclusive end in local time. Null range = no filtering. */
fun AnalyticsPeriod.dateRangeMillis(nowMillis: Long = System.currentTimeMillis()): Pair<Long, Long>? {
    val cal = Calendar.getInstance().apply { timeInMillis = nowMillis }
    return when (this) {
        AnalyticsPeriod.THIS_MONTH -> monthRange(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH))
        AnalyticsPeriod.LAST_MONTH -> {
            cal.add(Calendar.MONTH, -1)
            monthRange(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH))
        }
        AnalyticsPeriod.ALL_TIME -> null
    }
}

fun AnalyticsPeriod.displayTitle(nowMillis: Long = System.currentTimeMillis()): String = when (this) {
    AnalyticsPeriod.THIS_MONTH -> monthTitle(nowMillis)
    AnalyticsPeriod.LAST_MONTH -> {
        val cal = Calendar.getInstance().apply { timeInMillis = nowMillis }
        cal.add(Calendar.MONTH, -1)
        monthTitle(cal.timeInMillis)
    }
    AnalyticsPeriod.ALL_TIME -> "All time"
}

private fun monthRange(year: Int, month: Int): Pair<Long, Long> {
    val start = Calendar.getInstance().apply {
        set(year, month, 1, 0, 0, 0)
        set(Calendar.MILLISECOND, 0)
    }
    val end = Calendar.getInstance().apply {
        set(year, month, 1, 0, 0, 0)
        set(Calendar.MILLISECOND, 0)
        add(Calendar.MONTH, 1)
    }
    return start.timeInMillis to end.timeInMillis
}

private fun monthTitle(millis: Long): String {
    val fmt = SimpleDateFormat("MMMM yyyy", Locale.getDefault())
    return fmt.format(Date(millis))
}

fun List<Expense>.filterByPeriod(period: AnalyticsPeriod, nowMillis: Long = System.currentTimeMillis()): List<Expense> {
    val range = period.dateRangeMillis(nowMillis) ?: return this
    val (start, end) = range
    return filter { it.dateMillis in start until end }
}

data class SpendingInsights(
    val daysLoggedThisWeek: Int = 0,
    val monthExpenseTotal: Double = 0.0,
    val monthIncomeTotal: Double = 0.0,
    val topExpenseCategoryName: String? = null,
    val topExpenseCategoryAmount: Double = 0.0
)

fun computeSpendingInsights(
    expenses: List<Expense>,
    categoryNames: Map<Long, String>
): SpendingInsights {
    val now = System.currentTimeMillis()
    val weekStart = Calendar.getInstance().apply {
        timeInMillis = now
        add(Calendar.DAY_OF_YEAR, -6)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    val daysLogged = expenses
        .filter { it.dateMillis >= weekStart }
        .map { localDayStartMillis(it.dateMillis) }
        .distinct()
        .size

    val monthExpenses = expenses.filterByPeriod(AnalyticsPeriod.THIS_MONTH, now)
    val billable = monthExpenses.filter { !it.isTransfer() }
    val monthExpenseTotal = billable.filter { it.isExpense() }.sumOf { it.amount }
    val monthIncomeTotal = billable.filter { it.isIncome() }.sumOf { it.amount }

    val topCategory = billable
        .filter { it.isExpense() }
        .groupBy { it.categoryId }
        .mapValues { (_, items) -> items.sumOf { it.amount } }
        .maxByOrNull { it.value }

    return SpendingInsights(
        daysLoggedThisWeek = daysLogged,
        monthExpenseTotal = monthExpenseTotal,
        monthIncomeTotal = monthIncomeTotal,
        topExpenseCategoryName = topCategory?.key?.let { categoryNames[it] },
        topExpenseCategoryAmount = topCategory?.value ?: 0.0
    )
}
