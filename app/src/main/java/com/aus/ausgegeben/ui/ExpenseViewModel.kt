package com.aus.ausgegeben.ui

import androidx.lifecycle.SavedStateHandle
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
import com.aus.ausgegeben.util.localDayFlow
import com.aus.ausgegeben.util.rowsCountedToDate
import com.aus.ausgegeben.util.startOfTomorrowMillis
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
    /** Every row in the listed period: the list and its day totals. */
    val headerExpenses: List<Expense> = emptyList(),
    val categories: List<Category> = emptyList(),
    /** The current month up to today (rows dated after today left out): the budget bar. */
    val monthExpenses: List<Expense> = emptyList(),
    /** Current-month rows dated tomorrow or later: committed/planned spending. */
    val monthUpcomingExpenses: List<Expense> = emptyList(),
    val monthlyBudget: Double? = null,
    val currencyCode: String = "EUR",
    /**
     * [headerExpenses] as counted by the summary card: rows dated after today are left out while
     * the period includes today, like Insights. The list still shows them, marked upcoming.
     */
    val summaryExpenses: List<Expense> = emptyList(),
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
class ExpenseViewModel(
    private val categoryActions: CategoryActions,
    private val expenseActions: ExpenseActions,
    private val preferenceManager: TransactionPreferences,
    /** Start of the current local day, re-emitted when the date changes. Tests pass a fixed day. */
    localDay: Flow<Long>,
    /**
     * Filter persistence across process death. Null in unit tests and legacy callers; the
     * production Hilt constructor supplies the Activity's handle.
     */
    private val savedStateHandle: SavedStateHandle?,
) : ViewModel() {

    /** Unit/design-QA constructor with a fixed local day and no process-death persistence. */
    constructor(
        categoryActions: CategoryActions,
        expenseActions: ExpenseActions,
        preferenceManager: TransactionPreferences,
        localDay: Flow<Long>,
    ) : this(categoryActions, expenseActions, preferenceManager, localDay, null)

    /** Design-QA constructor using the production local-day flow. */
    constructor(
        categoryActions: CategoryActions,
        expenseActions: ExpenseActions,
        preferenceManager: TransactionPreferences,
    ) : this(categoryActions, expenseActions, preferenceManager, localDayFlow(), null)

    // Hilt uses this one. The day ticks on a timer, so unit tests use the primary constructor
    // with a fixed day: a ticking flow would keep advanceUntilIdle() running forever.
    @Inject constructor(
        categoryActions: CategoryActions,
        expenseActions: ExpenseActions,
        preferenceManager: TransactionPreferences,
        savedStateHandle: SavedStateHandle,
    ) : this(categoryActions, expenseActions, preferenceManager, localDayFlow(), savedStateHandle)

    private companion object {
        private const val KEY_OWNER = "recordFilters.ownerUid"
        private const val KEY_QUERY = "recordFilters.query"
        private const val KEY_TYPE = "recordFilters.type"
        private const val KEY_CATEGORIES = "recordFilters.categories"
        private const val KEY_MIN = "recordFilters.min"
        private const val KEY_MAX = "recordFilters.max"
        private const val KEY_SORT = "recordFilters.sort"
        private const val KEY_PERIOD = "recordFilters.period"
        private val MONTH_KEY = Regex("^month:20\\d{2}-(0[1-9]|1[0-2])$")
        private val AMOUNT_INPUT = Regex("^[0-9]+([.,][0-9]{1,2})?$")
    }

    private val localDayShared: Flow<Long> = localDay
        .distinctUntilChanged()
        .shareIn(viewModelScope, SharingStarted.WhileSubscribed(5000), replay = 1)

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
    /** True once a non-empty category snapshot has been observed (see categoriesShared). */
    private var categoriesLoaded = false
    private val categoriesShared: Flow<List<Category>> = categoryActions.allCategories
        .map { cats ->
            // An empty first emission (cache still warming) must not erase filters restored
            // from SavedStateHandle. Once a non-empty snapshot has been seen, an empty list
            // is authoritative (e.g. the last category was deleted) and must prune them.
            if (cats.isNotEmpty()) categoriesLoaded = true
            if (categoriesLoaded) {
                val valid = cats.filter { _typeFilter.value == TransactionTypeFilter.ALL ||
                    it.transactionType == _typeFilter.value.name.lowercase(Locale.ROOT) }.map { it.id }.toSet()
                setCategoryFilters(_composite.value.categoryIds.intersect(valid))
            }
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
    // The current month always includes today, so rows dated later this month are left out.
    private val insightsFlow = combine(
        monthExpensesShared,
        categoriesShared,
        localDayShared,
    ) { month, cats, day ->
        val categoryNames = cats.associate { it.id to it.name }
        computeSpendingInsights(rowsCountedToDate(month, null, day), emptyList(), categoryNames)
    }.distinctUntilChanged()
        .flowOn(Dispatchers.Default)

    /**
     * Rows the list is showing: period data filtered by search/type/category/amount.
     *
     * The day totals in [uiState] are produced by the *same* [filterRecords] call with the same
     * inputs, so the two can never disagree about what "the visible rows" means (UX-3). They
     * used to be computed from the unfiltered period, which made every day header contradict the
     * rows underneath it as soon as a filter was active.
     *
     * Deliberately not a shared flow: making this one shared stream (and deriving the totals from
     * it) couples this public Flow to the view model's lifecycle and broke cancellation-sensitive
     * tests, for no correctness gain — the predicate is shared, which is what matters.
     */
    val pagedExpenses: Flow<List<Expense>> = combine(
        listExpensesShared, _searchQuery, _typeFilter, _composite,
        categoriesShared,
    ) { expenses, query, type, filter, categories ->
        filterRecords(expenses, query, type, filter, categories.associate { it.id to it.name })
    }.flowOn(Dispatchers.Default)

    val uiState: StateFlow<RecordUiState> = combine(
        combine(listExpensesShared, categoriesShared, monthExpensesShared, budgetFlow, currencyFlow) { list, cats, month, budget, curr ->
            RecordData(
                headerExpenses = list,
                categories = cats,
                monthExpenses = month,
                monthlyBudget = budget,
                currencyCode = curr,
            )
        },
        combine(_searchQuery, _typeFilter, _listPeriod, _composite) { query, filter, period, composite ->
            RecordToolbarState(query, filter, composite.categoryIds.singleOrNull(), period, composite)
        },
        insightsFlow,
        // Snapshot metadata provides an honest offline coverage indication.
        expenseActions.recordIncomplete,
        localDayShared,
    ) { data, toolbar, insights, truncated, day ->
        // Filter once, with the same predicate and inputs `pagedExpenses` uses, and total exactly
        // those rows (UX-3). One source of truth for "which rows are visible"; the filter itself
        // is a cheap in-memory pass over the already-loaded period.
        val visible = filterRecords(
            data.headerExpenses,
            toolbar.searchQuery,
            toolbar.typeFilter,
            toolbar.composite,
            data.categories.associate { it.id to it.name },
        )
        RecordUiState(
            data.copy(
                monthExpenses = rowsCountedToDate(data.monthExpenses, null, day),
                monthUpcomingExpenses = data.monthExpenses.filter { it.dateMillis >= startOfTomorrowMillis(day) },
                summaryExpenses = rowsCountedToDate(
                    data.headerExpenses,
                    recordListDateRangeMillis(toolbar.listPeriod, day),
                    day,
                ),
            ),
            toolbar,
            insights,
            computeDayTotals(visible),
            isLoading = false,
            dataTruncated = truncated,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = RecordUiState(),
    )

    init {
        // Restore before the persistence collector starts, so the collector writes the
        // restored filters rather than the defaults.
        restoreFilters()
        viewModelScope.launch {
            combine(_searchQuery, _typeFilter, _composite, _listPeriod) { query, type, composite, period ->
                FilterSnapshot(query, type, composite, period)
            }.collect { persistFilters(it) }
        }
        // Only a real account change clears filters. The first emission is the account this
        // view model was created for — clearing it would erase filters restored from the
        // saved state after process death.
        var previousAccount: String? = null
        viewModelScope.launch {
            expenseActions.recordAccountId.distinctUntilChanged().collect { accountId ->
                if (previousAccount != null && previousAccount != accountId) {
                    clearFilters()
                    _softDeletedIds.value = emptySet()
                }
                previousAccount = accountId
            }
        }
    }

    private data class FilterSnapshot(
        val query: String,
        val type: TransactionTypeFilter,
        val composite: CompositeRecordFilter,
        val period: String,
    )

    /** Restore filters saved before process death; invalid or foreign-account state is ignored. */
    private fun restoreFilters() {
        val handle = savedStateHandle ?: return
        if (handle.get<String>(KEY_OWNER) != ownerUid) return

        val type = handle.get<String>(KEY_TYPE)
            ?.let { name -> runCatching { TransactionTypeFilter.valueOf(name) }.getOrNull() }
            ?: TransactionTypeFilter.ALL
        val sort = handle.get<String>(KEY_SORT)
            ?.let { name -> runCatching { RecordSort.valueOf(name) }.getOrNull() }
            ?: RecordSort.DATE_DESC
        val period = handle.get<String>(KEY_PERIOD)?.takeIf(::isValidPeriodKey)
            ?: RecordListPeriod.THIS_MONTH.key
        val categories = handle.get<ArrayList<String>>(KEY_CATEGORIES)
            ?.filterTo(linkedSetOf()) { it.isNotBlank() && it.length < 64 }
            ?: emptySet()
        val min = handle.get<String>(KEY_MIN)?.takeIf(::isValidAmountInput).orEmpty()
        val max = handle.get<String>(KEY_MAX)?.takeIf(::isValidAmountInput).orEmpty()
        val query = handle.get<String>(KEY_QUERY)?.take(200).orEmpty()

        _searchQuery.value = query
        _typeFilter.value = type
        _composite.value = CompositeRecordFilter(
            categoryIds = categories,
            minInput = min,
            maxInput = max,
            sort = sort,
        )
        _listPeriod.value = period
    }

    private fun persistFilters(snapshot: FilterSnapshot) {
        val handle = savedStateHandle ?: return
        // The first composition after process death can create a transient account-less view
        // model while Auth restores. It must not overwrite the real account's saved filters.
        if (ownerUid == null) return
        handle[KEY_OWNER] = ownerUid
        handle[KEY_QUERY] = snapshot.query.take(200)
        handle[KEY_TYPE] = snapshot.type.name
        handle[KEY_CATEGORIES] = ArrayList(snapshot.composite.categoryIds)
        handle[KEY_MIN] = snapshot.composite.minInput.take(16)
        handle[KEY_MAX] = snapshot.composite.maxInput.take(16)
        handle[KEY_SORT] = snapshot.composite.sort.name
        handle[KEY_PERIOD] = snapshot.period
    }

    private fun clearSavedFilters() {
        savedStateHandle?.keys()
            ?.filter { it.startsWith("recordFilters.") }
            ?.forEach { savedStateHandle.remove<Any>(it) }
    }

    private fun isValidPeriodKey(key: String): Boolean =
        key == RecordListPeriod.THIS_MONTH.key ||
            key == RecordListPeriod.ALL_TIME.key ||
            MONTH_KEY.matches(key)

    private fun isValidAmountInput(input: String): Boolean =
        input.length <= 16 && (input.isEmpty() || AMOUNT_INPUT.matches(input))

    override fun onCleared() {
        // Session end (sign-out, account switch, Activity finish): do not leave a search
        // string or filter selection behind in the Activity's saved state. Process death
        // does not call this, so filters still restore across process recreation. A
        // transient account-less view model must not erase the incoming account's state.
        if (ownerUid != null) clearSavedFilters()
        super.onCleared()
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
        clearSavedFilters()
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
