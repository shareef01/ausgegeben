package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.CashFlowPoint
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.analyticsDateRangeMillis
import com.aus.ausgegeben.util.analyticsPeriodOptionFromStorage
import com.aus.ausgegeben.util.computeCashFlowTrend
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
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
    val isLoading: Boolean = true,
    /** True when all-time analytics used a soft-capped expense fetch. */
    val dataTruncated: Boolean = false,
)

@HiltViewModel
class InsightsViewModel @Inject constructor(
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager,
) : ViewModel() {

    private val _periodKey = MutableStateFlow(AnalyticsPeriod.THIS_MONTH.storageKey)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val periodExpensesFlow = _periodKey.flatMapLatest { periodKey ->
        val range = analyticsDateRangeMillis(periodKey)
        if (range == null) {
            repository.allExpenses
        } else {
            repository.getExpensesInRange(range.first, range.second)
        }
    }

    val uiState: StateFlow<InsightsUiState> = combine(
        preferenceManager.currencyFlow,
        repository.allCategories,
        periodExpensesFlow,
        _periodKey,
        repository.dataTruncated,
    ) { currency, categories, scopedExpenses, periodKey, truncated ->
        buildInsightsState(currency, categories, scopedExpenses, periodKey, truncated)
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

    private fun buildInsightsState(
        currency: String,
        categories: List<Category>,
        scoped: List<Expense>,
        periodKey: String,
        truncated: Boolean,
    ): InsightsUiState {
        val categoryById = categories.associateBy { it.id }

        var totalExpenses = 0.0
        var totalIncome = 0.0
        var totalTransfers = 0.0
        val expenseTotals = mutableMapOf<String, Double>()
        val incomeTotals = mutableMapOf<String, Double>()
        val transferTotals = mutableMapOf<String, Double>()

        for (expense in scoped) {
            when {
                expense.isTransfer() -> {
                    totalTransfers += expense.amount
                    transferTotals[expense.categoryId] =
                        (transferTotals[expense.categoryId] ?: 0.0) + expense.amount
                }
                expense.isIncome() -> {
                    totalIncome += expense.amount
                    incomeTotals[expense.categoryId] =
                        (incomeTotals[expense.categoryId] ?: 0.0) + expense.amount
                }
                expense.isExpense() -> {
                    totalExpenses += expense.amount
                    expenseTotals[expense.categoryId] =
                        (expenseTotals[expense.categoryId] ?: 0.0) + expense.amount
                }
            }
        }

        // Round like web's computeTotals / groupByCategory: repeated Double addition leaves
        // artefacts (0.1 + 0.2), and unrounded values leaked into the distinctUntilChanged
        // comparison below, so equivalent states could look different.
        fun mapTotals(totals: Map<String, Double>): Map<Category, Double> =
            totals.mapNotNull { (categoryId, amount) ->
                categoryById[categoryId]?.let { it to CurrencyUtils.roundAmount(amount) }
            }.toMap()

        return InsightsUiState(
            periodKey = periodKey,
            periodLabel = analyticsPeriodOptionFromStorage(periodKey).label,
            totalExpenses = CurrencyUtils.roundAmount(totalExpenses),
            totalIncome = CurrencyUtils.roundAmount(totalIncome),
            totalTransfers = CurrencyUtils.roundAmount(totalTransfers),
            currency = currency,
            expensesByCategory = mapTotals(expenseTotals),
            incomeByCategory = mapTotals(incomeTotals),
            transfersByCategory = mapTotals(transferTotals),
            cashFlowTrend = scoped.computeCashFlowTrend(periodKey),
            isLoading = false,
            // Reported by the listener; re-deriving from scoped.size could not tell a
            // complete result of exactly the cap from a truncated one.
            dataTruncated = periodKey == AnalyticsPeriod.ALL_TIME.storageKey && truncated,
        )
    }

    private fun insightsStatesEquivalent(previous: InsightsUiState, current: InsightsUiState): Boolean {
        if (previous.periodKey != current.periodKey ||
            previous.periodLabel != current.periodLabel ||
            previous.currency != current.currency ||
            previous.totalExpenses != current.totalExpenses ||
            previous.totalIncome != current.totalIncome ||
            previous.totalTransfers != current.totalTransfers ||
            previous.dataTruncated != current.dataTruncated ||
            previous.cashFlowTrend != current.cashFlowTrend
        ) {
            return false
        }
        return categoryMapsEquivalent(previous.expensesByCategory, current.expensesByCategory) &&
            categoryMapsEquivalent(previous.incomeByCategory, current.incomeByCategory) &&
            categoryMapsEquivalent(previous.transfersByCategory, current.transfersByCategory)
    }

    private fun categoryMapsEquivalent(
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
}
