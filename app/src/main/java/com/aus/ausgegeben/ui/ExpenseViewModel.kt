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
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.RecordListPeriod
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
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class RecordUiState(
    val headerExpenses: List<Expense> = emptyList(),
    val categories: List<Category> = emptyList(),
    val searchQuery: String = "",
    val typeFilter: TransactionTypeFilter = TransactionTypeFilter.ALL,
    val listPeriod: RecordListPeriod = RecordListPeriod.THIS_MONTH,
    val insights: SpendingInsights = SpendingInsights(),
    val monthlyBudget: Double? = null,
    val monthExpenses: List<Expense> = emptyList(),
    val dayTotalsByLabel: Map<String, Pair<Double, Double>> = emptyMap(),
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

    private val monthExpensesFlow = flowOf(AnalyticsPeriod.THIS_MONTH.dateRangeMillis())
        .flatMapLatest { range ->
            if (range == null) {
                repository.allExpenses
            } else {
                repository.getExpensesInRange(range.first, range.second)
            }
        }

    private val weekExpensesFlow = flowOf(recentWeekRangeMillis())
        .flatMapLatest { (start, end) ->
            repository.getExpensesInRange(start, end)
        }

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
        _typeFilter,
        repository.expensesRevision.debounce(200),
    ) { period, query, filter, _ ->
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

    private val headerStateFlow = combine(
        combine(
            repository.allCategories,
            preferenceManager.monthlyBudgetFlow,
            preferenceManager.currencyFlow,
            listExpensesFlow,
            monthExpensesFlow,
        ) { categories, budget, currency, periodExpenses, monthExpenses ->
            RecordListData(categories, budget, currency, periodExpenses, monthExpenses)
        },
        weekExpensesFlow,
    ) { listData, weekExpenses ->
        val categoryNames = listData.categories.associate { it.id to it.name }
        val locale = CurrencyUtils.localeFor(listData.currency)
        RecordHeaderState(
            headerExpenses = listData.periodExpenses,
            categories = listData.categories,
            insights = computeSpendingInsights(
                listData.monthExpenses,
                weekExpenses,
                categoryNames,
            ),
            monthlyBudget = listData.budget,
            monthExpenses = listData.monthExpenses,
            dayTotalsByLabel = computeDayTotals(listData.periodExpenses, locale),
        )
    }.flowOn(Dispatchers.Default)

    val uiState: StateFlow<RecordUiState> = combine(
        headerStateFlow,
        _searchQuery,
        _typeFilter,
        _listPeriod,
    ) { header, query, typeFilter, listPeriod ->
        RecordUiState(
            headerExpenses = header.headerExpenses,
            categories = header.categories,
            searchQuery = query,
            typeFilter = typeFilter,
            listPeriod = listPeriod,
            insights = header.insights,
            monthlyBudget = header.monthlyBudget,
            monthExpenses = header.monthExpenses,
            dayTotalsByLabel = header.dayTotalsByLabel,
        )
    }
        .distinctUntilChanged()
        .stateIn(
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

private data class RecordListData(
    val categories: List<Category>,
    val budget: Double?,
    val currency: String,
    val periodExpenses: List<Expense>,
    val monthExpenses: List<Expense>,
)

private data class RecordHeaderState(
    val headerExpenses: List<Expense>,
    val categories: List<Category>,
    val insights: SpendingInsights,
    val monthlyBudget: Double?,
    val monthExpenses: List<Expense>,
    val dayTotalsByLabel: Map<String, Pair<Double, Double>>,
)
