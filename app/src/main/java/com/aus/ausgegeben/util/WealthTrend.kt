package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.isExpense
import com.aus.ausgegeben.ui.isIncome
import com.aus.ausgegeben.ui.isTransfer
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class WealthTrendPoint(
    val bucketStartMillis: Long,
    val label: String,
    val periodNet: Double,
    val cumulativeNet: Double
)

data class CashFlowPoint(
    val bucketStartMillis: Long,
    val label: String,
    val income: Double,
    val expense: Double
)

fun List<Expense>.computeCashFlowTrend(
    periodStorageKey: String,
    nowMillis: Long = System.currentTimeMillis()
): List<CashFlowPoint> {
    val range = analyticsDateRangeMillis(periodStorageKey, nowMillis)
    val scoped = range?.let { (start, end) ->
        filter { it.dateMillis in start until end }
    } ?: this
    val billable = scoped.filter { !it.isTransfer() }
    if (billable.isEmpty()) return emptyList()

    val locale = Locale.getDefault()
    val dayLabel = SimpleDateFormat("d", locale)
    val monthLabel = SimpleDateFormat("MMM yy", locale)

    val buckets: List<Pair<Long, String>> = if (range == null) {
        billable
            .groupBy { monthBucketStart(it.dateMillis) }
            .keys
            .sorted()
            .map { start -> start to monthLabel.format(Date(start)) }
    } else {
        val (rangeStart, rangeEnd) = range
        buildList {
            var cursor = localDayStartMillis(rangeStart)
            val end = localDayStartMillis(rangeEnd - 1)
            while (cursor <= end) {
                add(cursor to dayLabel.format(Date(cursor)))
                cursor += 24L * 60 * 60 * 1000
            }
        }
    }

    val itemsByBucket = if (range == null) {
        billable.groupBy { monthBucketStart(it.dateMillis) }
    } else {
        billable.groupBy { localDayStartMillis(it.dateMillis) }
    }

    return buckets.map { (start, label) ->
        val items = itemsByBucket[start].orEmpty()
        CashFlowPoint(
            bucketStartMillis = start,
            label = label,
            income = items.filter { it.isIncome() }.sumOf { it.amount },
            expense = items.filter { it.isExpense() }.sumOf { it.amount }
        )
    }
}

fun List<Expense>.computeWealthTrend(
    period: AnalyticsPeriod,
    nowMillis: Long = System.currentTimeMillis()
): List<WealthTrendPoint> {
    val scoped = filterByPeriod(period, nowMillis)
    val billable = scoped.filter { !it.isTransfer() }
    if (billable.isEmpty()) return emptyList()

    val locale = Locale.getDefault()
    val dayLabel = SimpleDateFormat("d", locale)
    val monthDayLabel = SimpleDateFormat("d MMM", locale)
    val monthLabel = SimpleDateFormat("MMM yy", locale)

    val buckets: List<Pair<Long, String>> = when (period) {
        AnalyticsPeriod.ALL_TIME -> {
            billable
                .groupBy { monthBucketStart(it.dateMillis) }
                .keys
                .sorted()
                .map { start -> start to monthLabel.format(Date(start)) }
        }
        else -> {
            val range = period.dateRangeMillis(nowMillis) ?: return emptyList()
            val (rangeStart, rangeEnd) = range
            buildList {
                var cursor = localDayStartMillis(rangeStart)
                val end = localDayStartMillis(rangeEnd - 1)
                while (cursor <= end) {
                    val label = if (period == AnalyticsPeriod.THIS_MONTH || period == AnalyticsPeriod.LAST_MONTH) {
                        dayLabel.format(Date(cursor))
                    } else {
                        monthDayLabel.format(Date(cursor))
                    }
                    add(cursor to label)
                    cursor += 24L * 60 * 60 * 1000
                }
            }
        }
    }

    if (buckets.isEmpty()) return emptyList()

    val netByBucket = when (period) {
        AnalyticsPeriod.ALL_TIME -> billable.groupBy { monthBucketStart(it.dateMillis) }
            .mapValues { (_, items) -> items.netTotal() }
        else -> billable.groupBy { localDayStartMillis(it.dateMillis) }
            .mapValues { (_, items) -> items.netTotal() }
    }

    var cumulative = 0.0
    return buckets.map { (start, label) ->
        val delta = netByBucket[start] ?: 0.0
        cumulative += delta
        WealthTrendPoint(
            bucketStartMillis = start,
            label = label,
            periodNet = delta,
            cumulativeNet = cumulative
        )
    }
}

private fun List<Expense>.netTotal(): Double {
    val income = filter { it.isIncome() }.sumOf { it.amount }
    val expense = filter { it.isExpense() }.sumOf { it.amount }
    return income - expense
}

private fun monthBucketStart(millis: Long): Long {
    val cal = Calendar.getInstance().apply {
        timeInMillis = millis
        set(Calendar.DAY_OF_MONTH, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    return cal.timeInMillis
}
