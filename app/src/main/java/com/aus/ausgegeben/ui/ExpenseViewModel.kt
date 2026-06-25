package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.ExpenseQueryParams
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.TransactionTypeFilterKey
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.RecordListPeriod
import com.aus.ausgegeben.util.computeSpendingInsights
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.filterByPeriod
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import com.aus.ausgegeben.util.SpendingInsights

data class RecordUiState(
    val headerExpenses: List<Expense> = emptyList(),
    val categories: List<Category> = emptyList(),
    val searchQuery: String = "",
    val typeFilter: TransactionTypeFilter = TransactionTypeFilter.ALL,
    val listPeriod: RecordListPeriod = RecordListPeriod.THIS_MONTH,
    val insights: SpendingInsights = SpendingInsights(),
    val monthlyBudget: Double? = null,
    val monthExpenses: List<Expense> = emptyList()
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class ExpenseViewModel(
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _debouncedSearch = _searchQuery.debounce(250)
    private val _typeFilter = MutableStateFlow(TransactionTypeFilter.ALL)
    private val _listPeriod = MutableStateFlow(RecordListPeriod.THIS_MONTH)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val listExpensesFlow = _listPeriod.flatMapLatest { period ->
        when (period) {
            RecordListPeriod.ALL_TIME -> repository.allExpenses
            RecordListPeriod.THIS_MONTH -> {
                val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis()
                    ?: return@flatMapLatest repository.allExpenses
                repository.getExpensesInRange(range.first, range.second)
            }
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    val pagedExpenses: Flow<PagingData<Expense>> = combine(
        _listPeriod,
        _debouncedSearch,
        _typeFilter
    ) { period, query, filter ->
        val (start, end) = when (period) {
            RecordListPeriod.ALL_TIME -> 0L to Long.MAX_VALUE
            RecordListPeriod.THIS_MONTH -> {
                AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: (0L to Long.MAX_VALUE)
            }
        }
        ExpenseQueryParams.forPeriod(
            startMillis = start,
            endMillis = end,
            typeFilter = filter.toFilterKey(),
            searchQuery = query
        )
    }.flatMapLatest { params ->
        repository.pagedExpenses(params)
    }.cachedIn(viewModelScope)

    val uiState: StateFlow<RecordUiState> = combine(
        combine(
            repository.allExpenses,
            repository.allCategories,
            preferenceManager.monthlyBudgetFlow
        ) { expenses, categories, budget ->
            Triple(expenses, categories, budget)
        },
        listExpensesFlow,
        _searchQuery,
        _typeFilter,
        _listPeriod
    ) { triple, periodExpenses, query, typeFilter, listPeriod ->
        val (allExpenses, categories, budget) = triple
        val categoryNames = categories.associate { it.id to it.name }
        val monthExpenses = allExpenses.filterByPeriod(AnalyticsPeriod.THIS_MONTH)

        RecordUiState(
            headerExpenses = periodExpenses,
            categories = categories,
            searchQuery = query,
            typeFilter = typeFilter,
            listPeriod = listPeriod,
            insights = computeSpendingInsights(allExpenses, categoryNames),
            monthlyBudget = budget,
            monthExpenses = monthExpenses
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = RecordUiState()
    )

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setTypeFilter(filter: TransactionTypeFilter) {
        _typeFilter.value = filter
    }

    fun setListPeriod(period: RecordListPeriod) {
        _listPeriod.value = period
    }

    fun duplicateExpense(expense: Expense) {
        viewModelScope.launch {
            repository.duplicateExpense(expense)
        }
    }

    fun deleteExpense(expense: Expense) {
        if (expense.id == 0L) return
        viewModelScope.launch {
            repository.deleteExpense(expense)
        }
    }

    fun restoreExpense(expense: Expense) {
        viewModelScope.launch {
            repository.insertExpense(expense)
        }
    }

    fun finalizeDeletedExpense(expense: Expense) {
        viewModelScope.launch {
            repository.purgeReceiptIfUnreferenced(expense.receiptImagePath)
        }
    }
}

private fun TransactionTypeFilter.toFilterKey(): TransactionTypeFilterKey = when (this) {
    TransactionTypeFilter.ALL -> TransactionTypeFilterKey.ALL
    TransactionTypeFilter.EXPENSE -> TransactionTypeFilterKey.EXPENSE
    TransactionTypeFilter.INCOME -> TransactionTypeFilterKey.INCOME
    TransactionTypeFilter.TRANSFER -> TransactionTypeFilterKey.TRANSFER
}
