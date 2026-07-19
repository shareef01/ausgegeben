package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.ExpenseQueryParams
import com.aus.ausgegeben.data.TransactionTypeFilterKey
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.RecordListPeriod
import com.aus.ausgegeben.util.recordListDateRangeMillis
import com.aus.ausgegeben.util.SpendingInsights
import com.aus.ausgegeben.util.computeDayTotals
import com.aus.ausgegeben.util.computeSpendingInsights
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.recentWeekRangeMillis
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class RecordUiState(
    val data: RecordData = RecordData(),
    val toolbar: RecordToolbarState = RecordToolbarState(),
    val insights: SpendingInsights = SpendingInsights(),
    val dayTotalsByDay: Map<Long, Pair<Double, Double>> = emptyMap(),
)

data class RecordData(
    val headerExpenses: List<Expense> = emptyList(),
    val categories: List<Category> = emptyList(),
    val monthExpenses: List<Expense> = emptyList(),
    val monthlyBudget: Double? = null,
    val currencyCode: String = "EUR"
)

data class RecordToolbarState(
    val searchQuery: String = "",
    val typeFilter: TransactionTypeFilter = TransactionTypeFilter.ALL,
    val listPeriod: String = RecordListPeriod.THIS_MONTH.key,
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class ExpenseViewModel(
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _debouncedSearch = _searchQuery.debounce(250)
    private val _typeFilter = MutableStateFlow(TransactionTypeFilter.ALL)
    private val _listPeriod = MutableStateFlow(RecordListPeriod.THIS_MONTH.key)

    // 1. Base data flows
    private val currencyFlow = preferenceManager.currencyFlow.distinctUntilChanged()
    private val budgetFlow = preferenceManager.monthlyBudgetFlow.distinctUntilChanged()
    private val categoriesFlow = repository.allCategories.distinctUntilChanged()

    // 2. Filtered expense flows
    private val monthExpensesFlow = flowOf(AnalyticsPeriod.THIS_MONTH.dateRangeMillis())
        .flatMapLatest { range ->
            if (range == null) repository.allExpenses else repository.getExpensesInRange(range.first, range.second)
        }.distinctUntilChanged()

    private val weekExpensesFlow = flowOf(recentWeekRangeMillis())
        .flatMapLatest { (start, end) ->
            repository.getExpensesInRange(start, end)
        }.distinctUntilChanged()

    private val listExpensesFlow = _listPeriod.flatMapLatest { periodKey ->
        val range = recordListDateRangeMillis(periodKey)
        if (range == null) repository.allExpenses else repository.getExpensesInRange(range.first, range.second)
    }.distinctUntilChanged()

    // 3. Derived Insights and UI State components
    private val insightsFlow = combine(
        monthExpensesFlow,
        weekExpensesFlow,
        categoriesFlow
    ) { month, week, cats ->
        val categoryNames = cats.associate { it.id to it.name }
        computeSpendingInsights(month, week, categoryNames)
    }.flowOn(Dispatchers.Default)

    private val dayTotalsFlow = listExpensesFlow
        .map { expenses -> computeDayTotals(expenses) }
        .flowOn(Dispatchers.Default)

    // 4. Final UI State assembly
    val uiState: StateFlow<RecordUiState> = combine(
        combine(listExpensesFlow, categoriesFlow, monthExpensesFlow, budgetFlow, currencyFlow) { list, cats, month, budget, curr ->
            RecordData(list, cats, month, budget, curr)
        },
        combine(_searchQuery, _typeFilter, _listPeriod) { query, filter, period ->
            RecordToolbarState(query, filter, period)
        },
        insightsFlow,
        dayTotalsFlow
    ) { data, toolbar, insights, totals ->
        RecordUiState(data, toolbar, insights, totals)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = RecordUiState()
    )

    @OptIn(ExperimentalCoroutinesApi::class)
    private val queriedExpensesFlow: Flow<List<Expense>> = combine(
        _listPeriod,
        _typeFilter,
        repository.expensesRevision,
    ) { period, filter, _ ->
        val (start, end) = recordListDateRangeMillis(period) ?: (0L to Long.MAX_VALUE)
        Pair(start, end) to filter
    }.flatMapLatest { (range, filter) ->
        repository.queryExpenses(ExpenseQueryParams.forPeriod(range.first, range.second, filter.toFilterKey()))
    }.distinctUntilChanged()

    // Firestore query is scoped to period + type only; search matches client-side
    // (note, amount, category name), same fields the web client filters on.
    val pagedExpenses: Flow<List<Expense>> = combine(
        queriedExpensesFlow,
        _debouncedSearch,
        categoriesFlow,
    ) { expenses, query, categories ->
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return@combine expenses
        val categoryNames = categories.associate { it.id to it.name.lowercase() }
        expenses.filter { expense ->
            expense.note.lowercase().contains(needle) ||
                expense.amount.toString().contains(needle) ||
                categoryNames[expense.categoryId]?.contains(needle) == true
        }
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setTypeFilter(filter: TransactionTypeFilter) {
        _typeFilter.value = filter
    }

    fun setListPeriod(period: String) {
        _listPeriod.value = period
    }

    fun duplicateExpense(expense: Expense, onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val success = try {
                repository.duplicateExpense(expense)
                true
            } catch (_: Exception) {
                false
            }
            onResult(success)
        }
    }

    fun deleteExpense(expense: Expense, onResult: (Boolean) -> Unit = {}) {
        if (expense.id.isBlank()) {
            onResult(false)
            return
        }
        viewModelScope.launch {
            val success = try {
                repository.deleteExpense(expense)
                true
            } catch (_: Exception) {
                false
            }
            onResult(success)
        }
    }

    fun restoreExpense(expense: Expense) {
        viewModelScope.launch {
            try {
                repository.insertExpense(expense)
            } catch (_: Exception) { }
        }
    }

    fun finalizeDeletedExpense(expense: Expense) {
        // no-op retained for call-site compatibility
    }
}
private fun TransactionTypeFilter.toFilterKey(): TransactionTypeFilterKey = when (this) {
    TransactionTypeFilter.ALL -> TransactionTypeFilterKey.ALL
    TransactionTypeFilter.EXPENSE -> TransactionTypeFilterKey.EXPENSE
    TransactionTypeFilter.INCOME -> TransactionTypeFilterKey.INCOME
    TransactionTypeFilter.TRANSFER -> TransactionTypeFilterKey.TRANSFER
}
