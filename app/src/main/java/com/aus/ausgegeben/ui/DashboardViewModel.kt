package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.sync.SyncManager
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.WealthTrendPoint
import com.aus.ausgegeben.util.computeWealthTrend
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.displayTitle
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

data class DashboardUiState(
    val period: AnalyticsPeriod = AnalyticsPeriod.THIS_MONTH,
    val periodLabel: String = "",
    val totalExpenses: Double = 0.0,
    val totalIncome: Double = 0.0,
    val totalTransfers: Double = 0.0,
    val currency: String = "EUR",
    val expensesByCategory: Map<Category, Double> = emptyMap(),
    val incomeByCategory: Map<Category, Double> = emptyMap(),
    val transfersByCategory: Map<Category, Double> = emptyMap(),
    val periodTransactions: List<Expense> = emptyList(),
    val wealthTrend: List<WealthTrendPoint> = emptyList(),
)

class DashboardViewModel(
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager,
    private val syncManager: SyncManager? = null,
) : ViewModel() {

    private val _period = MutableStateFlow(AnalyticsPeriod.THIS_MONTH)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val periodExpensesFlow = _period.flatMapLatest { period ->
        val range = period.dateRangeMillis()
        if (range == null) {
            repository.allExpenses
        } else {
            repository.getExpensesInRange(range.first, range.second)
        }
    }

    val uiState: StateFlow<DashboardUiState> = combine(
        preferenceManager.currencyFlow,
        repository.allCategories,
        periodExpensesFlow,
        _period,
    ) { currency, categories, scopedExpenses, period ->
        buildDashboardState(currency, categories, scopedExpenses, period)
    }
        .flowOn(Dispatchers.Default)
        .distinctUntilChanged()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = DashboardUiState()
        )

    init {
        viewModelScope.launch {
            _period.value = AnalyticsPeriod.fromStorageKey(
                preferenceManager.analyticsPeriodFlow.first()
            )
        }
    }

    fun setPeriod(period: AnalyticsPeriod) {
        _period.value = period
        viewModelScope.launch {
            preferenceManager.updateAnalyticsPeriod(period)
            syncManager?.onPreferencesChanged()
        }
    }

    private fun buildDashboardState(
        currency: String,
        categories: List<Category>,
        scoped: List<Expense>,
        period: AnalyticsPeriod,
    ): DashboardUiState {
        val categoryById = categories.associateBy { it.id }

        var totalExpenses = 0.0
        var totalIncome = 0.0
        var totalTransfers = 0.0
        val expenseTotals = mutableMapOf<Long, Double>()
        val incomeTotals = mutableMapOf<Long, Double>()
        val transferTotals = mutableMapOf<Long, Double>()

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

        fun mapTotals(totals: Map<Long, Double>): Map<Category, Double> =
            totals.mapNotNull { (categoryId, amount) ->
                categoryById[categoryId]?.let { it to amount }
            }.toMap()

        return DashboardUiState(
            period = period,
            periodLabel = period.displayTitle(),
            totalExpenses = totalExpenses,
            totalIncome = totalIncome,
            totalTransfers = totalTransfers,
            currency = currency,
            expensesByCategory = mapTotals(expenseTotals),
            incomeByCategory = mapTotals(incomeTotals),
            transfersByCategory = mapTotals(transferTotals),
            periodTransactions = scoped,
            wealthTrend = scoped.computeWealthTrend(period),
        )
    }
}
