package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AllTimeAverages
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.CashFlowPoint
import com.aus.ausgegeben.util.CategoryMover
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.PeriodComparison
import com.aus.ausgegeben.util.SpendingPace
import com.aus.ausgegeben.util.analyticsDateRangeMillis
import com.aus.ausgegeben.util.analyticsPeriodOptionFromStorage
import com.aus.ausgegeben.util.computeAllTimeAverages
import com.aus.ausgegeben.util.computeCashFlowTrend
import com.aus.ausgegeben.util.computeCategoryMovers
import com.aus.ausgegeben.util.computePeriodComparison
import com.aus.ausgegeben.util.computeSpendingPace
import com.aus.ausgegeben.util.previousPeriodRange
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

data class InsightsUiState(
    val periodKey: String = AnalyticsPeriod.THIS_MONTH.storageKey,
    val periodLabel: String = "",
    val totalExpenses: Double = 0.0,
    val totalIncome: Double = 0.0,
    val totalTransfers: Double = 0.0,
    val currency: String = "EUR",
    val expensesByCategory: Map<Category, Double> = emptyMap(),
    val incomeByCategory: Map<Category, Double> = emptyMap(),
    val transfersByCategory: Map<Category, Double> = emptyMap(),
    val cashFlowTrend: List<CashFlowPoint> = emptyList(),
    val comparison: PeriodComparison? = null,
    val pace: SpendingPace? = null,
    val categoryMovers: List<CategoryMover> = emptyList(),
    val allTimeAverages: AllTimeAverages? = null,
    val isLoading: Boolean = true,
    /** True when all-time analytics used a soft-capped expense fetch. */
    val dataTruncated: Boolean = false,
)

@HiltViewModel
class InsightsViewModel @Inject constructor(
    private val categoryActions: CategoryActions,
    private val expenseActions: ExpenseActions,
    private val preferenceManager: TransactionPreferences,
) : ViewModel() {

    private val _periodKey = MutableStateFlow(AnalyticsPeriod.THIS_MONTH.storageKey)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val scopedAndPriorExpensesFlow = _periodKey.flatMapLatest { periodKey ->
        val range = analyticsDateRangeMillis(periodKey)
        val prior = previousPeriodRange(periodKey)
        val currentFlow = if (range == null) {
            expenseActions.allExpenses
        } else {
            expenseActions.getExpensesInRange(range.first, range.second)
        }
        val priorFlow = if (prior == null) {
            flowOf(emptyList())
        } else {
            expenseActions.getExpensesInRange(prior.second.first, prior.second.second)
        }
        combine(currentFlow, priorFlow) { current, previous -> current to previous }
    }

    private val prefsTupleFlow = combine(
        preferenceManager.currencyFlow,
        preferenceManager.monthlyBudgetFlow
    ) { currency, budget -> currency to budget }

    val uiState: StateFlow<InsightsUiState> = combine(
        prefsTupleFlow,
        categoryActions.allCategories,
        scopedAndPriorExpensesFlow,
        _periodKey,
        expenseActions.dataTruncated,
    ) { (currency, monthlyBudget), categories, (scopedExpenses, priorExpenses), periodKey, truncated ->
        buildInsightsState(
            currency = currency,
            categories = categories,
            scoped = scopedExpenses,
            priorExpenses = priorExpenses,
            periodKey = periodKey,
            monthlyBudget = monthlyBudget,
            truncated = truncated,
        )
    }
        .flowOn(Dispatchers.Default)
        .distinctUntilChanged { previous, current ->
            insightsStatesEquivalent(previous, current)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = InsightsUiState()
        )

    init {
        viewModelScope.launch {
            _periodKey.value = analyticsPeriodOptionFromStorage(
                preferenceManager.analyticsPeriodFlow.first()
            ).storageKey
        }
    }

    fun setPeriodKey(periodKey: String) {
        _periodKey.value = periodKey
        viewModelScope.launch {
            preferenceManager.updateAnalyticsPeriodKey(periodKey)
        }
    }
}

/**
 * Stand-in for a category an expense still points at but which no longer exists, so the
 * amount stays visible in the breakdown instead of vanishing from it. Name and colour
 * match the web client's fallback (`cat?.name ?? '?'`, `0xff7eb0e8`) so the same orphan
 * looks the same on both clients. The id is the dangling categoryId, which keeps distinct
 * orphans in distinct rows and keeps [categoryMapsEquivalent] comparisons stable.
 */
internal fun orphanCategoryPlaceholder(categoryId: String): Category = Category(
    id = categoryId,
    name = "?",
    iconName = "help",
    colorInt = 0xff7eb0e8.toInt(),
)

/**
 * Pure, and separated from the ViewModel so the totals/rounding/grouping logic can be
 * tested directly instead of only through the combine/flowOn/stateIn pipeline — the same
 * reasoning categoriesAfterMove was pulled out of CategoryViewModel for.
 */
internal fun buildInsightsState(
    currency: String,
    categories: List<Category>,
    scoped: List<Expense>,
    periodKey: String,
    truncated: Boolean,
    priorExpenses: List<Expense> = emptyList(),
    monthlyBudget: Double? = null,
    nowMillis: Long = System.currentTimeMillis(),
): InsightsUiState {
    val categoryById = categories.associateBy { it.id }

    var totalExpenses = 0L
    var totalIncome = 0L
    var totalTransfers = 0L
    val expenseTotals = mutableMapOf<String, Long>()
    val incomeTotals = mutableMapOf<String, Long>()
    val transferTotals = mutableMapOf<String, Long>()

    for (expense in scoped) {
        when {
            expense.isTransfer() -> {
                val minor = CurrencyUtils.toMinorUnits(expense.amount)
                totalTransfers += minor
                transferTotals[expense.categoryId] =
                    (transferTotals[expense.categoryId] ?: 0L) + minor
            }
            expense.isIncome() -> {
                val minor = CurrencyUtils.toMinorUnits(expense.amount)
                totalIncome += minor
                incomeTotals[expense.categoryId] =
                    (incomeTotals[expense.categoryId] ?: 0L) + minor
            }
            expense.isExpense() -> {
                val minor = CurrencyUtils.toMinorUnits(expense.amount)
                totalExpenses += minor
                expenseTotals[expense.categoryId] =
                    (expenseTotals[expense.categoryId] ?: 0L) + minor
            }
        }
    }

    // Round like web's computeTotals / groupByCategory: repeated Double addition leaves
    // artefacts (0.1 + 0.2), and unrounded values leaked into the distinctUntilChanged
    // comparison below, so equivalent states could look different.
    //
    // An expense whose category no longer exists keeps its own row rather than being
    // dropped. mapNotNull used to discard it, which made the breakdown silently disagree
    // with the headline total — the money left the chart with no indication, while the
    // "Spent" figure above it still counted the row. Orphans are reachable (see
    // deleteCategory's unfixable rows), and the web client has always shown them as "?".
    fun mapTotals(totals: Map<String, Long>): Map<Category, Double> =
        totals.map { (categoryId, amount) ->
            val category = categoryById[categoryId] ?: orphanCategoryPlaceholder(categoryId)
            category to CurrencyUtils.fromMinorUnits(amount)
        }.toMap()

    val range = analyticsDateRangeMillis(periodKey, nowMillis)

    val comparison: PeriodComparison?
    val pace: SpendingPace?
    val categoryMovers: List<CategoryMover>
    val allTimeAverages: AllTimeAverages?

    if (range != null) {
        var priorTotalExpenses = 0L
        var priorTotalIncome = 0L
        val priorExpenseTotals = mutableMapOf<String, Long>()

        for (expense in priorExpenses) {
            when {
                expense.isIncome() -> {
                    priorTotalIncome += CurrencyUtils.toMinorUnits(expense.amount)
                }
                expense.isExpense() -> {
                    val minor = CurrencyUtils.toMinorUnits(expense.amount)
                    priorTotalExpenses += minor
                    priorExpenseTotals[expense.categoryId] =
                        (priorExpenseTotals[expense.categoryId] ?: 0L) + minor
                }
            }
        }

        comparison = computePeriodComparison(
            currentExpenses = CurrencyUtils.fromMinorUnits(totalExpenses),
            currentIncome = CurrencyUtils.fromMinorUnits(totalIncome),
            priorExpenses = CurrencyUtils.fromMinorUnits(priorTotalExpenses),
            priorIncome = CurrencyUtils.fromMinorUnits(priorTotalIncome),
            hasPriorData = priorExpenses.isNotEmpty(),
        )

        pace = computeSpendingPace(
            currentExpenses = CurrencyUtils.fromMinorUnits(totalExpenses),
            rangeMillis = range,
            nowMillis = nowMillis,
            monthlyBudget = monthlyBudget,
        )

        val currentCatMap = expenseTotals.mapValues { CurrencyUtils.fromMinorUnits(it.value) }
        val priorCatMap = priorExpenseTotals.mapValues { CurrencyUtils.fromMinorUnits(it.value) }
        categoryMovers = computeCategoryMovers(
            currentExpensesMap = currentCatMap,
            priorExpensesMap = priorCatMap,
            categories = categories,
            maxMovers = 3,
        )
        allTimeAverages = null
    } else {
        comparison = null
        pace = null
        categoryMovers = emptyList()
        allTimeAverages = computeAllTimeAverages(scoped)
    }

    return InsightsUiState(
        periodKey = periodKey,
        periodLabel = analyticsPeriodOptionFromStorage(periodKey, nowMillis).label,
        totalExpenses = CurrencyUtils.fromMinorUnits(totalExpenses),
        totalIncome = CurrencyUtils.fromMinorUnits(totalIncome),
        totalTransfers = CurrencyUtils.fromMinorUnits(totalTransfers),
        currency = currency,
        expensesByCategory = mapTotals(expenseTotals),
        incomeByCategory = mapTotals(incomeTotals),
        transfersByCategory = mapTotals(transferTotals),
        cashFlowTrend = scoped.computeCashFlowTrend(periodKey, nowMillis),
        comparison = comparison,
        pace = pace,
        categoryMovers = categoryMovers,
        allTimeAverages = allTimeAverages,
        isLoading = false,
        // Reported by the listener; re-deriving from scoped.size could not tell a
        // complete result of exactly the cap from a truncated one.
        dataTruncated = periodKey == AnalyticsPeriod.ALL_TIME.storageKey && truncated,
    )
}

internal fun insightsStatesEquivalent(previous: InsightsUiState, current: InsightsUiState): Boolean {
    if (previous.periodKey != current.periodKey ||
        previous.periodLabel != current.periodLabel ||
        previous.currency != current.currency ||
        previous.totalExpenses != current.totalExpenses ||
        previous.totalIncome != current.totalIncome ||
        previous.totalTransfers != current.totalTransfers ||
        previous.dataTruncated != current.dataTruncated ||
        previous.comparison != current.comparison ||
        previous.pace != current.pace ||
        previous.categoryMovers != current.categoryMovers ||
        previous.allTimeAverages != current.allTimeAverages ||
        previous.cashFlowTrend != current.cashFlowTrend
    ) {
        return false
    }
    return categoryMapsEquivalent(previous.expensesByCategory, current.expensesByCategory) &&
        categoryMapsEquivalent(previous.incomeByCategory, current.incomeByCategory) &&
        categoryMapsEquivalent(previous.transfersByCategory, current.transfersByCategory)
}

internal fun categoryMapsEquivalent(
    previous: Map<Category, Double>,
    current: Map<Category, Double>,
): Boolean {
    if (previous.size != current.size) return false
    return previous.all { (category, amount) ->
        current.entries.any { (other, otherAmount) ->
            other.id == category.id && otherAmount == amount
        }
    }
}
