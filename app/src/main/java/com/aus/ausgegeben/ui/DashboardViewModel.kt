package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.displayTitle
import com.aus.ausgegeben.util.filterByPeriod
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
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
    val periodTransactions: List<Expense> = emptyList()
)

class DashboardViewModel(
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager
) : ViewModel() {

    private val _period = MutableStateFlow(AnalyticsPeriod.THIS_MONTH)

    val uiState: StateFlow<DashboardUiState> = combine(
        preferenceManager.currencyFlow,
        repository.allCategories,
        repository.allExpenses,
        _period
    ) { currency, categories, allExpenses, period ->
        val scoped = allExpenses.filterByPeriod(period)
        val billable = scoped.filter { !it.isTransfer() }
        val transfers = scoped.filter { it.isTransfer() }

        val expensesByCategory = categories.associateWith { category ->
            billable
                .filter { it.categoryId == category.id && it.isExpense() }
                .sumOf { it.amount }
        }.filterValues { it > 0 }

        val incomeByCategory = categories.associateWith { category ->
            billable
                .filter { it.categoryId == category.id && it.isIncome() }
                .sumOf { it.amount }
        }.filterValues { it > 0 }

        val transfersByCategory = categories.associateWith { category ->
            transfers.filter { it.categoryId == category.id }.sumOf { it.amount }
        }.filterValues { it > 0 }

        DashboardUiState(
            period = period,
            periodLabel = period.displayTitle(),
            totalExpenses = billable.filter { it.isExpense() }.sumOf { it.amount },
            totalIncome = billable.filter { it.isIncome() }.sumOf { it.amount },
            totalTransfers = transfers.sumOf { it.amount },
            currency = currency,
            expensesByCategory = expensesByCategory,
            incomeByCategory = incomeByCategory,
            transfersByCategory = transfersByCategory,
            periodTransactions = scoped
        )
    }.stateIn(
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
        }
    }
}
