package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.isExpense
import com.aus.ausgegeben.ui.isIncome
import com.aus.ausgegeben.ui.isTransfer
import java.util.Calendar
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class PeriodComparison(
    val hasPriorData: Boolean,
    val priorExpenses: Double,
    val priorIncome: Double,
    val expenseDelta: Double,
    val expensePercentageDelta: Double?,
    val incomeDelta: Double,
    val incomePercentageDelta: Double?,
    val netDelta: Double,
)

data class SpendingPace(
    val daysElapsed: Int,
    val daysInMonth: Int,
    val dailyAverage: Double,
    val projectedTotal: Double,
    val budget: Double?,
    val projectedOverBudget: Double?,
)

data class CategoryMover(
    val categoryId: String,
    val categoryName: String,
    val iconName: String,
    val colorInt: Int,
    val currentAmount: Double,
    val priorAmount: Double,
    val delta: Double,
    val percentageDelta: Double?,
)

data class AllTimeAverages(
    val monthsCount: Int,
    val averageMonthlyExpenses: Double,
    val averageMonthlyIncome: Double,
    val averageMonthlyNet: Double,
)

fun computePeriodComparison(
    currentExpenses: Double,
    currentIncome: Double,
    priorExpenses: Double,
    priorIncome: Double,
    hasPriorData: Boolean,
): PeriodComparison {
    if (!hasPriorData) {
        return PeriodComparison(
            hasPriorData = false,
            priorExpenses = 0.0,
            priorIncome = 0.0,
            expenseDelta = 0.0,
            expensePercentageDelta = null,
            incomeDelta = 0.0,
            incomePercentageDelta = null,
            netDelta = 0.0,
        )
    }

    val currentExpMinor = CurrencyUtils.toMinorUnits(currentExpenses)
    val priorExpMinor = CurrencyUtils.toMinorUnits(priorExpenses)
    val currentIncMinor = CurrencyUtils.toMinorUnits(currentIncome)
    val priorIncMinor = CurrencyUtils.toMinorUnits(priorIncome)

    val expenseDelta = CurrencyUtils.fromMinorUnits(currentExpMinor - priorExpMinor)
    val incomeDelta = CurrencyUtils.fromMinorUnits(currentIncMinor - priorIncMinor)
    val currentNetMinor = currentIncMinor - currentExpMinor
    val priorNetMinor = priorIncMinor - priorExpMinor
    val netDelta = CurrencyUtils.fromMinorUnits(currentNetMinor - priorNetMinor)

    val expensePercentageDelta = if (priorExpMinor > 0) {
        (((currentExpMinor - priorExpMinor).toDouble() / priorExpMinor.toDouble()) * 1000.0).roundToInt() / 10.0
    } else {
        null
    }

    val incomePercentageDelta = if (priorIncMinor > 0) {
        (((currentIncMinor - priorIncMinor).toDouble() / priorIncMinor.toDouble()) * 1000.0).roundToInt() / 10.0
    } else {
        null
    }

    return PeriodComparison(
        hasPriorData = true,
        priorExpenses = CurrencyUtils.fromMinorUnits(priorExpMinor),
        priorIncome = CurrencyUtils.fromMinorUnits(priorIncMinor),
        expenseDelta = expenseDelta,
        expensePercentageDelta = expensePercentageDelta,
        incomeDelta = incomeDelta,
        incomePercentageDelta = incomePercentageDelta,
        netDelta = netDelta,
    )
}

fun computeSpendingPace(
    currentExpenses: Double,
    rangeMillis: Pair<Long, Long>?,
    nowMillis: Long = System.currentTimeMillis(),
    monthlyBudget: Double? = null,
): SpendingPace? {
    if (rangeMillis == null) return null
    val (start, end) = rangeMillis
    val daysInMonth = ((end - start) / 86_400_000L).toInt()
    if (daysInMonth <= 0) return null

    val daysElapsed: Int
    val dailyAverage: Double
    val projectedTotal: Double
    val currentExpMinor = CurrencyUtils.toMinorUnits(currentExpenses)

    when {
        nowMillis >= end -> {
            daysElapsed = daysInMonth
            dailyAverage = CurrencyUtils.fromMinorUnits((currentExpMinor.toDouble() / daysInMonth.toDouble()).roundToInt().toLong())
            projectedTotal = currentExpenses
        }
        nowMillis < start -> {
            daysElapsed = 0
            dailyAverage = 0.0
            projectedTotal = 0.0
        }
        else -> {
            val cal = Calendar.getInstance().apply { timeInMillis = nowMillis }
            val dayOfMonth = cal.get(Calendar.DAY_OF_MONTH)
            daysElapsed = min(max(dayOfMonth, 1), daysInMonth)
            val dailyAverageMinor = (currentExpMinor.toDouble() / daysElapsed.toDouble()).roundToInt().toLong()
            dailyAverage = CurrencyUtils.fromMinorUnits(dailyAverageMinor)
            projectedTotal = CurrencyUtils.fromMinorUnits(dailyAverageMinor * daysInMonth)
        }
    }

    val budget = if (monthlyBudget != null && monthlyBudget > 0) monthlyBudget else null
    val projectedOverBudget = if (budget != null) {
        val projectedMinor = CurrencyUtils.toMinorUnits(projectedTotal)
        val budgetMinor = CurrencyUtils.toMinorUnits(budget)
        if (projectedMinor > budgetMinor) {
            CurrencyUtils.fromMinorUnits(projectedMinor - budgetMinor)
        } else {
            null
        }
    } else {
        null
    }

    return SpendingPace(
        daysElapsed = daysElapsed,
        daysInMonth = daysInMonth,
        dailyAverage = dailyAverage,
        projectedTotal = projectedTotal,
        budget = budget,
        projectedOverBudget = projectedOverBudget,
    )
}

fun computeCategoryMovers(
    currentExpensesMap: Map<String, Double>,
    priorExpensesMap: Map<String, Double>,
    categories: List<Category>,
    maxMovers: Int = 3,
): List<CategoryMover> {
    val categoryById = categories.associateBy { it.id }
    val allCategoryIds = currentExpensesMap.keys + priorExpensesMap.keys

    val movers = mutableListOf<CategoryMover>()

    for (catId in allCategoryIds) {
        val current = currentExpensesMap[catId] ?: 0.0
        val prior = priorExpensesMap[catId] ?: 0.0
        val currentMinor = CurrencyUtils.toMinorUnits(current)
        val priorMinor = CurrencyUtils.toMinorUnits(prior)
        val deltaMinor = currentMinor - priorMinor
        if (deltaMinor == 0L) continue

        val delta = CurrencyUtils.fromMinorUnits(deltaMinor)
        val percentageDelta = if (priorMinor > 0) {
            (((currentMinor - priorMinor).toDouble() / priorMinor.toDouble()) * 1000.0).roundToInt() / 10.0
        } else {
            null
        }

        val cat = categoryById[catId]
        movers.add(
            CategoryMover(
                categoryId = catId,
                categoryName = cat?.name ?: "?",
                iconName = cat?.iconName ?: "help",
                colorInt = cat?.colorInt ?: 0xff7eb0e8.toInt(),
                currentAmount = current,
                priorAmount = prior,
                delta = delta,
                percentageDelta = percentageDelta,
            )
        )
    }

    return movers
        .sortedByDescending { abs(it.delta) }
        .take(maxMovers)
}

fun computeAllTimeAverages(expenses: List<Expense>): AllTimeAverages? {
    val billable = expenses.filter { !it.isTransfer() }
    if (billable.isEmpty()) return null

    val months = mutableSetOf<Long>()
    var totalExpensesMinor = 0L
    var totalIncomeMinor = 0L

    for (e in billable) {
        val cal = Calendar.getInstance().apply {
            timeInMillis = e.dateMillis
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        months.add(cal.timeInMillis)
        val minor = CurrencyUtils.toMinorUnits(e.amount)
        if (e.isExpense()) totalExpensesMinor += minor
        else if (e.isIncome()) totalIncomeMinor += minor
    }

    val monthsCount = max(months.size, 1)
    val avgExp = CurrencyUtils.fromMinorUnits((totalExpensesMinor.toDouble() / monthsCount.toDouble()).roundToInt().toLong())
    val avgInc = CurrencyUtils.fromMinorUnits((totalIncomeMinor.toDouble() / monthsCount.toDouble()).roundToInt().toLong())
    val avgNet = CurrencyUtils.fromMinorUnits(((totalIncomeMinor - totalExpensesMinor).toDouble() / monthsCount.toDouble()).roundToInt().toLong())

    return AllTimeAverages(
        monthsCount = monthsCount,
        averageMonthlyExpenses = avgExp,
        averageMonthlyIncome = avgInc,
        averageMonthlyNet = avgNet,
    )
}
