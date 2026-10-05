package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.RecordListPeriod
import com.aus.ausgegeben.util.recordListDateRangeMillis
import com.aus.ausgegeben.util.SpendingInsights
import com.aus.ausgegeben.util.computeDayTotals
import com.aus.ausgegeben.util.computeSpendingInsights
import com.aus.ausgegeben.util.dateRangeMillis
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Locale
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

data class RecordUiState(
    val data: RecordData = RecordData(),
    val toolbar: RecordToolbarState = RecordToolbarState(),
    val insights: SpendingInsights = SpendingInsights(),
    val dayTotalsByDay: Map<Long, Pair<Double, Double>> = emptyMap(),
    val isLoading: Boolean = true,
    /** True while cache coverage has not been confirmed by a server snapshot. */
    val dataTruncated: Boolean = false,
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
    val categoryFilter: String? = null,
    val listPeriod: String = RecordListPeriod.THIS_MONTH.key,
    val composite: CompositeRecordFilter = CompositeRecordFilter(),
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class ExpenseViewModel @Inject constructor(
    private val categoryActions: CategoryActions,
    private val expenseActions: ExpenseActions,
    private val preferenceManager: TransactionPreferences,
) : ViewModel() {

    private val ownerUid = expenseActions.currentRecordAccountId
    private fun ownerIsCurrent() = ownerUid == null || expenseActions.currentRecordAccountId == ownerUid

    private val _searchQuery = MutableStateFlow("")
    private val _typeFilter = MutableStateFlow(TransactionTypeFilter.ALL)
    private val _composite = MutableStateFlow(CompositeRecordFilter())
    private val _listPeriod = MutableStateFlow(RecordListPeriod.THIS_MONTH.key)
    /** Hidden until snackbar undo expires — Firestore delete runs in [commitSoftDelete]. */
    private val _softDeletedIds = MutableStateFlow<Set<String>>(emptySet())
    // 1. Base data flows
    private val currencyFlow = preferenceManager.currencyFlow.distinctUntilChanged()
    private val budgetFlow = preferenceManager.monthlyBudgetFlow.distinctUntilChanged()
    private val categoriesShared: Flow<List<Category>> = categoryActions.allCategories
        .map { cats ->
            val valid = cats.filter { _typeFilter.value == TransactionTypeFilter.ALL ||
                it.transactionType == _typeFilter.value.name.lowercase(Locale.ROOT) }.map { it.id }.toSet()
            setCategoryFilters(_composite.value.categoryIds.intersect(valid))
            cats
        }
        .distinctUntilChanged()
        .shareIn(viewModelScope, SharingStarted.WhileSubscribed(), replay = 1)

    private fun Flow<List<Expense>>.excludingSoftDeleted(): Flow<List<Expense>> =
        combine(this, _softDeletedIds) { expenses, hidden ->
            if (hidden.isEmpty()) expenses else expenses.filter { it.id !in hidden }
        }

    /**
     * Shared calendar-month listener — budget bar + "most spent" always need it.
     * Reused as the list source when [RecordListPeriod.THIS_MONTH] is selected so we
     * do not open a second identical month query.
     */
    private val monthExpensesShared: Flow<List<Expense>> =
        flowOf(AnalyticsPeriod.THIS_MONTH.dateRangeMillis())
            .flatMapLatest { range ->
                if (range == null) expenseActions.allExpenses
                else expenseActions.getRecordExpensesInRange(range.first, range.second)
            }
            .excludingSoftDeleted()
            .distinctUntilChanged()
            .shareIn(viewModelScope, SharingStarted.WhileSubscribed(5000), replay = 1)

    /**
     * Period-scoped expenses for summary / day totals. One Firestore subscription
     * (reuses [monthExpensesShared] for this month). Type/search filtering is client-side
     * in [pagedExpenses] — avoids a parallel queryExpenses listener.
     */
    private val listExpensesShared: Flow<List<Expense>> = _listPeriod
        .flatMapLatest { periodKey ->
            if (periodKey == RecordListPeriod.THIS_MONTH.key) {
                monthExpensesShared
            } else {
                val range = recordListDateRangeMillis(periodKey)
                val base = if (range == null) {
                    expenseActions.recordExpenses
                } else {
                    expenseActions.getRecordExpensesInRange(range.first, range.second)
                }
                base.excludingSoftDeleted()
            }
        }
        .distinctUntilChanged()
        .shareIn(viewModelScope, SharingStarted.WhileSubscribed(5000), replay = 1)

    // Week listener dropped: daysLoggedThisWeek is unused in UI; top category uses month only.
    private val insightsFlow = combine(
        monthExpensesShared,
        categoriesShared,
    ) { month, cats ->
        val categoryNames = cats.associate { it.id to it.name }
        computeSpendingInsights(month, emptyList(), categoryNames)
    }.distinctUntilChanged()
        .flowOn(Dispatchers.Default)

    private val dayTotalsFlow = listExpensesShared
        .map { expenses -> computeDayTotals(expenses) }
        .distinctUntilChanged()
        .flowOn(Dispatchers.Default)

    val uiState: StateFlow<RecordUiState> = combine(
        combine(listExpensesShared, categoriesShared, monthExpensesShared, budgetFlow, currencyFlow) { list, cats, month, budget, curr ->
            RecordData(list, cats, month, budget, curr)
        },
        combine(_searchQuery, _typeFilter, _listPeriod, _composite) { query, filter, period, composite ->
            RecordToolbarState(query, filter, composite.categoryIds.singleOrNull(), period, composite)
        },
        insightsFlow,
        dayTotalsFlow,
        // Snapshot metadata provides an honest offline coverage indication.
        expenseActions.recordIncomplete,
    ) { data, toolbar, insights, totals, truncated ->
        RecordUiState(
            data,
            toolbar,
            insights,
            totals,
            isLoading = false,
            dataTruncated = truncated,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = RecordUiState(),
    )

    // Period data from [listExpensesShared]; type + category + search filtered here (web parity).
    val pagedExpenses: Flow<List<Expense>> = combine(
        listExpensesShared, _searchQuery, _typeFilter, _composite,
        combine(categoriesShared, currencyFlow) { cats, currency -> cats to currency },
    ) { expenses, query, type, filter, metadata ->
        filterRecords(expenses, query, type, filter, metadata.first.associate { it.id to it.name }, metadata.second)
    }.flowOn(Dispatchers.Default)

    init {
        viewModelScope.launch {
            expenseActions.recordAccountId.distinctUntilChanged().collect { clearFilters(); _softDeletedIds.value = emptySet() }
        }
    }

    fun toggleCategory(id: String) {
        val ids = _composite.value.categoryIds
        setCategoryFilters(if (id in ids) ids - id else ids + id)
    }
    fun setCategoryFilters(ids: Set<String>) {
        _composite.value = _composite.value.copy(categoryIds = ids)
    }
    fun setMinAmount(input: String) { _composite.value = _composite.value.copy(minInput = input) }
    fun setMaxAmount(input: String) { _composite.value = _composite.value.copy(maxInput = input) }
    fun setSort(sort: RecordSort) { _composite.value = _composite.value.copy(sort = sort) }
    fun clearFilters() {
        _searchQuery.value = ""
        _typeFilter.value = TransactionTypeFilter.ALL
        _composite.value = CompositeRecordFilter()
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setTypeFilter(filter: TransactionTypeFilter) {
        _typeFilter.value = filter
        val valid = uiState.value.data.categories.filter { filter == TransactionTypeFilter.ALL ||
            it.transactionType == filter.name.lowercase(Locale.ROOT) }.map { it.id }.toSet()
        setCategoryFilters(_composite.value.categoryIds.intersect(valid))
    }

    fun setCategoryFilter(categoryId: String?) {
        setCategoryFilters(categoryId?.let { setOf(it) } ?: emptySet())
    }

    fun setListPeriod(period: String) {
        _listPeriod.value = period
    }

    fun duplicateExpense(expense: Expense, onResult: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            if (!ownerIsCurrent()) { onResult(false, null); return@launch }
            val result = if (ownerUid == null) expenseActions.duplicateExpense(expense)
                else expenseActions.duplicateRecordExpense(expense, ownerUid)
            onResult(result.isSuccess, result.exceptionOrNull()?.message?.takeIf { it == "EMAIL_NOT_VERIFIED" })
        }
    }

    /** Hide locally; call [commitSoftDelete] after the undo window closes. */
    fun softDelete(expense: Expense): Boolean {
        if (expense.id.isBlank() || !ownerIsCurrent()) return false
        _softDeletedIds.value = _softDeletedIds.value + expense.id
        return true
    }

    fun undoSoftDelete(expense: Expense) {
        if (expense.id.isBlank()) return
        _softDeletedIds.value = _softDeletedIds.value - expense.id
    }

    fun commitSoftDelete(expense: Expense, onResult: (Boolean, String?) -> Unit = { _, _ -> }) {
        if (expense.id.isBlank()) {
            onResult(false, null)
            return
        }
        viewModelScope.launch {
            if (!ownerIsCurrent()) { onResult(false, null); return@launch }
            val result = if (ownerUid == null) expenseActions.deleteExpense(expense)
                else expenseActions.deleteRecordExpense(expense, ownerUid)
            // Always unhide: success means gone from Firestore; failure shows the row again.
            _softDeletedIds.value = _softDeletedIds.value - expense.id
            onResult(result.isSuccess, result.exceptionOrNull()?.message?.takeIf { it == "EMAIL_NOT_VERIFIED" })
        }
    }
}
