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

data class AnalyticsPeriodOption(
    val label: String,
    val storageKey: String,
    val rangeMillis: Pair<Long, Long>?
)

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

fun analyticsPeriodOptions(
    nowMillis: Long = System.currentTimeMillis(),
    monthsBack: Int = 12
): List<AnalyticsPeriodOption> {
    val cal = Calendar.getInstance().apply {
        timeInMillis = nowMillis
        set(Calendar.DAY_OF_MONTH, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    return buildList {
        add(
            AnalyticsPeriodOption(
                label = "All time",
                storageKey = AnalyticsPeriod.ALL_TIME.storageKey,
                rangeMillis = null
            )
        )
        repeat(monthsBack.coerceAtLeast(1)) {
            val year = cal.get(Calendar.YEAR)
            val month = cal.get(Calendar.MONTH)
            val range = monthRange(year, month)
            add(
                AnalyticsPeriodOption(
                    label = monthTitle(range.first),
                    storageKey = monthStorageKey(year, month),
                    rangeMillis = range
                )
            )
            cal.add(Calendar.MONTH, -1)
        }
    }
}

fun analyticsPeriodOptionFromStorage(
    key: String?,
    nowMillis: Long = System.currentTimeMillis()
): AnalyticsPeriodOption {
    val normalized = key ?: AnalyticsPeriod.THIS_MONTH.storageKey
    analyticsMonthRangeFromStorageKey(normalized)?.let { range ->
        return AnalyticsPeriodOption(
            label = monthTitle(range.first),
            storageKey = normalized,
            rangeMillis = range
        )
    }
    val legacy = AnalyticsPeriod.fromStorageKey(normalized)
    val range = legacy.dateRangeMillis(nowMillis)
    val storageKey = if (legacy == AnalyticsPeriod.ALL_TIME || range == null) {
        legacy.storageKey
    } else {
        val cal = Calendar.getInstance().apply { timeInMillis = range.first }
        monthStorageKey(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH))
    }
    return AnalyticsPeriodOption(
        label = legacy.displayTitle(nowMillis),
        storageKey = storageKey,
        rangeMillis = range
    )
}

fun analyticsDateRangeMillis(
    storageKey: String,
    nowMillis: Long = System.currentTimeMillis()
): Pair<Long, Long>? {
    if (storageKey == AnalyticsPeriod.ALL_TIME.storageKey) return null
    return analyticsPeriodOptionFromStorage(storageKey, nowMillis).rangeMillis
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

private fun monthStorageKey(year: Int, zeroBasedMonth: Int): String =
    "month:%04d-%02d".format(Locale.US, year, zeroBasedMonth + 1)

private fun analyticsMonthRangeFromStorageKey(key: String): Pair<Long, Long>? {
    if (!key.startsWith("month:")) return null
    val parts = key.removePrefix("month:").split("-")
    val year = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val month = parts.getOrNull(1)?.toIntOrNull()?.minus(1) ?: return null
    if (month !in 0..11) return null
    return monthRange(year, month)
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

fun recentWeekRangeMillis(nowMillis: Long = System.currentTimeMillis()): Pair<Long, Long> {
    val weekStart = Calendar.getInstance().apply {
        timeInMillis = nowMillis
        add(Calendar.DAY_OF_YEAR, -6)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    return weekStart to nowMillis + 1
}

fun computeSpendingInsights(
    monthExpenses: List<Expense>,
    weekExpenses: List<Expense>,
    categoryNames: Map<Long, String>,
): SpendingInsights {
    val daysLogged = weekExpenses
        .map { localDayStartMillis(it.dateMillis) }
        .distinct()
        .size

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

fun computeDayTotals(
    expenses: List<Expense>,
    locale: Locale,
): Map<String, Pair<Double, Double>> {
    val dayTotals = mutableMapOf<Long, Pair<Double, Double>>()
    
    for (expense in expenses) {
        if (expense.isTransfer()) continue
        val dayStart = localDayStartMillis(expense.dateMillis)
        val current = dayTotals.getOrDefault(dayStart, 0.0 to 0.0)
        
        val next = if (expense.isIncome()) {
            (current.first + expense.amount) to current.second
        } else {
            current.first to (current.second + expense.amount)
        }
        dayTotals[dayStart] = next
    }
    
    val dateFormat = SimpleDateFormat("dd.MM EEE", locale)
    return dayTotals.mapKeys { dateFormat.format(Date(it.key)) }
}
