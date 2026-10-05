package com.aus.ausgegeben.ui

import android.app.Application
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.RecordListPeriod
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.robolectric.annotation.Config
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Covers duplicateExpense's error handling and the soft-delete-with-undo lifecycle —
 * previously untestable since ExpenseViewModel depended on the concrete AppRepository
 * and PreferenceManager with no seam to fake either through.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class ExpenseViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var fakeCategories: FakeCategoryActions
    private lateinit var fakeExpenses: FakeExpenseActions
    private lateinit var fakePreferences: FakeTransactionPreferences
    private lateinit var viewModel: ExpenseViewModel

    private val category =
        Category(id = "c1", name = "Groceries", iconName = "cart", colorInt = 1, transactionType = "expense")
    private val expense =
        Expense(id = "e1", amount = 12.5, dateMillis = System.currentTimeMillis(), categoryId = "c1", note = "milk")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        fakeCategories = FakeCategoryActions()
        fakeExpenses = FakeExpenseActions()
        fakePreferences = FakeTransactionPreferences()
        viewModel = ExpenseViewModel(fakeCategories, fakeExpenses, fakePreferences)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun duplicateExpense_success_reportsSuccessWithNoErrorCode() = runTest(dispatcher) {
        var success: Boolean? = null
        var code: String? = null
        viewModel.duplicateExpense(expense) { s, c -> success = s; code = c }
        advanceUntilIdle()

        assertEquals(true, success)
        assertEquals(null, code)
    }

    @Test
    fun duplicateExpense_emailNotVerified_reportsThatSpecificCode() = runTest(dispatcher) {
        fakeExpenses.duplicateResult = Result.failure(IllegalStateException("EMAIL_NOT_VERIFIED"))
        var success: Boolean? = null
        var code: String? = null
        viewModel.duplicateExpense(expense) { s, c -> success = s; code = c }
        advanceUntilIdle()

        assertEquals(false, success)
        assertEquals("EMAIL_NOT_VERIFIED", code)
    }

    @Test
    fun softDelete_blankId_returnsFalse() {
        assertFalse(viewModel.softDelete(expense.copy(id = "")))
    }

    @Test
    fun softDelete_hidesRowFromPagedExpenses_undoRestoresIt() = runTest(dispatcher) {
        fakeExpenses.expenses.value = listOf(expense)
        val job = launch { viewModel.pagedExpenses.collect {} }
        advanceUntilIdle()

        assertTrue(viewModel.pagedExpenses.first().any { it.id == "e1" })

        assertTrue(viewModel.softDelete(expense))
        advanceUntilIdle()
        assertFalse(viewModel.pagedExpenses.first().any { it.id == "e1" })

        viewModel.undoSoftDelete(expense)
        advanceUntilIdle()
        assertTrue(viewModel.pagedExpenses.first().any { it.id == "e1" })

        job.cancel()
    }

    @Test
    fun commitSoftDelete_success_deletesAndReportsSuccess() = runTest(dispatcher) {
        fakeExpenses.expenses.value = listOf(expense)
        val job = launch { viewModel.pagedExpenses.collect {} }
        advanceUntilIdle()
        viewModel.softDelete(expense)
        advanceUntilIdle()

        var success: Boolean? = null
        viewModel.commitSoftDelete(expense) { s, _ -> success = s }
        advanceUntilIdle()

        assertEquals(true, success)
        assertEquals("e1", fakeExpenses.lastDeletedId)
        job.cancel()
    }

    @Test
    fun commitSoftDelete_failure_unhidesRowAgain() = runTest(dispatcher) {
        fakeExpenses.expenses.value = listOf(expense)
        fakeExpenses.deleteResult = Result.failure(RuntimeException("boom"))
        val job = launch { viewModel.pagedExpenses.collect {} }
        advanceUntilIdle()
        viewModel.softDelete(expense)
        advanceUntilIdle()
        assertFalse(viewModel.pagedExpenses.first().any { it.id == "e1" })

        var success: Boolean? = null
        viewModel.commitSoftDelete(expense) { s, _ -> success = s }
        advanceUntilIdle()

        assertEquals(false, success)
        // A failed delete must not leave the row permanently hidden.
        assertTrue(viewModel.pagedExpenses.first().any { it.id == "e1" })
        job.cancel()
    }

    @Test
    fun commitSoftDelete_blankId_reportsFailureWithoutCallingRepository() = runTest(dispatcher) {
        var success: Boolean? = null
        var called = false
        viewModel.commitSoftDelete(expense.copy(id = "")) { s, _ -> success = s; called = true }
        advanceUntilIdle()

        assertTrue(called)
        assertEquals(false, success)
        assertEquals(null, fakeExpenses.lastDeletedId)
    }

    @Test
    fun toolbarFilters_andSearchQuery_updateUiStateProperly() = runTest(dispatcher) {
        val job = launch { viewModel.uiState.collect {} }
        advanceUntilIdle()

        // uiState combines insightsFlow and dayTotalsFlow, both of which end in
        // flowOn(Dispatchers.Default) — real threads that advanceUntilIdle() does not wait
        // for, since it only drains the virtual scheduler. combine withholds its first
        // emission until every input has produced one, so asserting immediately raced the
        // thread pool and intermittently read the placeholder initialValue instead
        // (isLoading = true, blank toolbar). That lost the race only under the load of the
        // full suite, which is why the test passed when run alone. Wait for the first real
        // emission; after it, toolbar changes travel solely through the test dispatcher.
        viewModel.uiState.first { !it.isLoading }

        viewModel.setSearchQuery("coffee")
        advanceUntilIdle()
        assertEquals("coffee", viewModel.uiState.value.toolbar.searchQuery)

        viewModel.setSearchQuery("")
        advanceUntilIdle()
        assertEquals("", viewModel.uiState.value.toolbar.searchQuery)

        viewModel.setTypeFilter(TransactionTypeFilter.INCOME)
        advanceUntilIdle()
        assertEquals(TransactionTypeFilter.INCOME, viewModel.uiState.value.toolbar.typeFilter)

        viewModel.setListPeriod(RecordListPeriod.ALL_TIME.key)
        advanceUntilIdle()
        assertEquals(RecordListPeriod.ALL_TIME.key, viewModel.uiState.value.toolbar.listPeriod)

        // Reset to defaults
        viewModel.setTypeFilter(TransactionTypeFilter.ALL)
        viewModel.setListPeriod(RecordListPeriod.THIS_MONTH.key)
        advanceUntilIdle()
        assertEquals(TransactionTypeFilter.ALL, viewModel.uiState.value.toolbar.typeFilter)
        assertEquals(RecordListPeriod.THIS_MONTH.key, viewModel.uiState.value.toolbar.listPeriod)

        job.cancel()
    }

    @Test
    fun categoryFilter_updatesUiStateAndFiltersPagedExpenses() = runTest(dispatcher) {
        backgroundScope.launch { viewModel.uiState.collect {} }
        viewModel.uiState.first { !it.isLoading }
        val expense2 = Expense(id = "e2", amount = 5.0, dateMillis = System.currentTimeMillis(), categoryId = "c2", note = "train")
        fakeExpenses.expenses.value = listOf(expense, expense2)
        val job = launch { viewModel.pagedExpenses.collect {} }
        advanceUntilIdle()

        // Initially both are emitted
        assertEquals(2, viewModel.pagedExpenses.first().size)

        viewModel.setCategoryFilter("c1")
        advanceUntilIdle()
        assertEquals("c1", viewModel.uiState.value.toolbar.categoryFilter)
        val paged = viewModel.pagedExpenses.first()
        assertEquals(1, paged.size)
        assertEquals("e1", paged.first().id)

        viewModel.setCategoryFilter(null)
        advanceUntilIdle()
        assertEquals(null, viewModel.uiState.value.toolbar.categoryFilter)
        assertEquals(2, viewModel.pagedExpenses.first().size)

        job.cancel()
    }

    @Test
    fun setTypeFilter_resetsIncompatibleCategoryFilter() = runTest(dispatcher) {
        backgroundScope.launch { viewModel.uiState.collect {} }
        viewModel.uiState.first { !it.isLoading }
        val expenseCat = Category(id = "c1", name = "Groceries", iconName = "cart", colorInt = 1, transactionType = "expense")
        val incomeCat = Category(id = "c2", name = "Salary", iconName = "cash", colorInt = 2, transactionType = "income")
        fakeCategories.categoriesFlow.value = listOf(expenseCat, incomeCat)
        advanceUntilIdle()

        viewModel.setCategoryFilter("c1")
        advanceUntilIdle()
        assertEquals("c1", viewModel.uiState.value.toolbar.categoryFilter)

        // Switching to EXPENSE should keep c1 (compatible)
        viewModel.setTypeFilter(TransactionTypeFilter.EXPENSE)
        advanceUntilIdle()
        assertEquals("c1", viewModel.uiState.value.toolbar.categoryFilter)

        // Switching to INCOME should reset c1 to null (incompatible)
        viewModel.setTypeFilter(TransactionTypeFilter.INCOME)
        advanceUntilIdle()
        assertEquals(null, viewModel.uiState.value.toolbar.categoryFilter)
    }

    @Test
    fun construction_onImmediateMain_initializesCategoryFlowBeforeCollecting() = runTest(dispatcher) {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        ExpenseViewModel(fakeCategories, fakeExpenses, fakePreferences)
    }

    @Test
    fun categoryFilter_composesWithPeriodTypeAndSearch_clearPreservesOtherFilters() = runTest(dispatcher) {
        fakeCategories.categoriesFlow.value = listOf(category)
        val march = java.time.LocalDate.of(2026, 3, 15).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        fakeExpenses.expenses.value = listOf(
            expense.copy(id = "match", dateMillis = march),
            expense.copy(id = "otherCategory", dateMillis = march, categoryId = "c2"),
            expense.copy(id = "otherMonth", dateMillis = march + 40L * 86400000),
            expense.copy(id = "otherType", dateMillis = march, transactionType = "income"),
            expense.copy(id = "otherNote", dateMillis = march, note = "bread"),
        )
        backgroundScope.launch { viewModel.uiState.collect {} }
        viewModel.uiState.first { !it.isLoading }
        viewModel.setListPeriod("month:2026-03")
        viewModel.setTypeFilter(TransactionTypeFilter.EXPENSE)
        viewModel.setSearchQuery("milk")
        viewModel.setCategoryFilter("c1")
        advanceUntilIdle()
        assertEquals(listOf("match"), viewModel.pagedExpenses.first().map { it.id })
        viewModel.setCategoryFilter(null)
        advanceUntilIdle()
        assertEquals(listOf("match", "otherCategory"), viewModel.pagedExpenses.first().map { it.id })
        assertEquals("month:2026-03", viewModel.uiState.value.toolbar.listPeriod)
        assertEquals(TransactionTypeFilter.EXPENSE, viewModel.uiState.value.toolbar.typeFilter)
        assertEquals("milk", viewModel.uiState.value.toolbar.searchQuery)
        // Category deletion removes the unavailable selection and preserves other criteria.
        viewModel.setCategoryFilter("c1")
        fakeCategories.categoriesFlow.value = emptyList()
        advanceUntilIdle()
        assertEquals(emptySet<String>(), viewModel.uiState.value.toolbar.composite.categoryIds)
        assertEquals(listOf("match", "otherCategory"), viewModel.pagedExpenses.first().map { it.id })
        viewModel.setCategoryFilter("deleted")
        advanceUntilIdle()
        assertTrue(viewModel.pagedExpenses.first().isEmpty())
    }

    @Test
    fun compatibleVisibleCategory_isNotClearedByLaggingSnapshot() = runTest(dispatcher) {
        val cold = ColdCategoryFlow()
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        backgroundScope.launch { vm.uiState.collect {} }
        vm.uiState.first { !it.isLoading }

        // Old design: leave its first (private cache) subscription empty while
        // the presentation subscriptions receive c1. Shared design: deliver c1
        // to the sole subscription. No timing assumptions or sleeps.
        val ids = cold.activeIds()
        val presentationIds = if (ids.size == 1) ids else ids.drop(1)
        presentationIds.forEach { cold.emitTo(it, listOf(category)) }
        vm.uiState.first { it.data.categories == listOf(category) }
        vm.setCategoryFilter("c1")
        vm.uiState.first { it.toolbar.categoryFilter == "c1" }
        vm.setTypeFilter(TransactionTypeFilter.EXPENSE)
        vm.uiState.first { it.toolbar.typeFilter == TransactionTypeFilter.EXPENSE }
        assertEquals("c1", vm.uiState.value.toolbar.categoryFilter)
        assertEquals(1, cold.activeIds().size)
    }

    @Test
    fun typeCompatibility_usesPublishedMetadataAfterChange() = runTest(dispatcher) {
        val cold = ColdCategoryFlow(listOf(category))
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        backgroundScope.launch { vm.uiState.collect {} }
        vm.uiState.first { it.data.categories == listOf(category) }
        vm.setCategoryFilter("c1")
        vm.uiState.first { it.toolbar.categoryFilter == "c1" }
        val income = category.copy(transactionType = "income")
        cold.emitToAll(listOf(income))
        vm.uiState.first { it.data.categories == listOf(income) }
        assertEquals("c1", vm.uiState.value.toolbar.categoryFilter)
        vm.setTypeFilter(TransactionTypeFilter.EXPENSE)
        vm.uiState.first { it.toolbar.typeFilter == TransactionTypeFilter.EXPENSE }
        assertEquals(null, vm.uiState.value.toolbar.categoryFilter)
        vm.setCategoryFilter("c1")
        vm.setTypeFilter(TransactionTypeFilter.INCOME)
        vm.uiState.first { it.toolbar.typeFilter == TransactionTypeFilter.INCOME }
        assertEquals("c1", vm.uiState.value.toolbar.categoryFilter)
    }

    @Test
    fun missingCategory_isClearedWhenChangingType() = runTest(dispatcher) {
        val cold = ColdCategoryFlow()
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        backgroundScope.launch { vm.uiState.collect {} }
        vm.uiState.first { !it.isLoading }
        vm.setCategoryFilter("missing")
        vm.setTypeFilter(TransactionTypeFilter.ALL)
        vm.uiState.first { it.toolbar.categoryFilter == null }
        vm.setTypeFilter(TransactionTypeFilter.EXPENSE)
        vm.uiState.first { it.toolbar.typeFilter == TransactionTypeFilter.EXPENSE }
        assertEquals(null, vm.uiState.value.toolbar.categoryFilter)
    }

    @Test
    fun categoryListener_stopsWhenRecordHasNoCollectors() = runTest(dispatcher) {
        val cold = ColdCategoryFlow(listOf(category))
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        runCurrent()
        assertEquals(0, cold.activeIds().size)
        val job = backgroundScope.launch { vm.uiState.collect {} }
        vm.uiState.first { !it.isLoading }
        assertEquals(1, cold.activeIds().size)
        job.cancel()
        runCurrent()
        advanceTimeBy(5_001)
        runCurrent()
        assertEquals(0, cold.activeIds().size)
    }

    @Test
    fun categoryListener_resubscribesAndSelection_survivesSubscriberRestart() = runTest(dispatcher) {
        val cold = ColdCategoryFlow(listOf(category))
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        val job = backgroundScope.launch { vm.uiState.collect {} }
        vm.uiState.first { it.data.categories == listOf(category) }
        val originalSubscription = cold.opened.receive()
        vm.setCategoryFilter("c1")
        vm.setSearchQuery("milk")
        vm.uiState.first { it.toolbar.categoryFilter == "c1" && it.toolbar.searchQuery == "milk" }
        job.cancel()
        runCurrent()
        advanceTimeBy(5_001)
        runCurrent()
        assertEquals(0, cold.activeIds().size)

        val renamed = category.copy(name = "Updated groceries")
        cold.initialSnapshot = listOf(renamed)
        backgroundScope.launch { vm.uiState.collect {} }
        val restartedSubscription = cold.opened.receive()
        assertTrue(restartedSubscription > originalSubscription)
        vm.uiState.first { it.data.categories == listOf(renamed) }
        assertEquals(1, cold.activeIds().size)
        assertEquals("c1", vm.uiState.value.toolbar.categoryFilter)
        assertEquals("milk", vm.uiState.value.toolbar.searchQuery)
    }

    @Test
    fun categoryListener_multipleDownstreamCollectorsShareOneUpstream() = runTest(dispatcher) {
        val cold = ColdCategoryFlow(listOf(category))
        val vm = ExpenseViewModel(fakeCategories.withFlow(cold.values), fakeExpenses, fakePreferences)
        val first = backgroundScope.launch { vm.uiState.collect {} }
        val second = backgroundScope.launch { vm.uiState.collect {} }
        val rows = backgroundScope.launch { vm.pagedExpenses.collect {} }
        vm.uiState.first { !it.isLoading }
        runCurrent()
        assertEquals(1, cold.activeIds().size)
        first.cancel()
        second.cancel()
        runCurrent()
        advanceTimeBy(5_001)
        runCurrent()
        assertEquals(1, cold.activeIds().size) // Rows still consume category names.
        rows.cancelAndJoin()
        runCurrent()
        assertEquals(0, cold.activeIds().size)
    }

    @Test
    fun compositeSearch_discoversBeyondCap_andUpdatesReactively() = runTest(dispatcher) {
        fakeCategories.categoriesFlow.value = listOf(category)
        val target = expense.copy(id = "old-match", dateMillis = 1, note = "Coffee", amount = 12.50)
        fakeExpenses.expenses.value = (1..5001).map { expense.copy(id = "row$it", note = "other", dateMillis = 10000L + it) } + target
        backgroundScope.launch { viewModel.uiState.collect {} }
        backgroundScope.launch { viewModel.pagedExpenses.collect {} }
        viewModel.uiState.first { !it.isLoading }
        viewModel.setListPeriod("all_time")
        viewModel.setSearchQuery(" COFF ")
        viewModel.setCategoryFilters(setOf("c1"))
        viewModel.setMinAmount("12,50")
        viewModel.setMaxAmount("12.50")
        viewModel.setSort(RecordSort.AMOUNT_ASC)
        advanceUntilIdle()
        assertEquals(listOf("old-match"), viewModel.pagedExpenses.first().map { it.id })
        fakeExpenses.expenses.value = fakeExpenses.expenses.value.map { if (it.id == target.id) it.copy(note = "tea") else it }
        advanceUntilIdle()
        assertTrue(viewModel.pagedExpenses.first().isEmpty())
        fakeExpenses.expenses.value = fakeExpenses.expenses.value + target.copy(id = "new-match")
        advanceUntilIdle()
        assertEquals(listOf("new-match"), viewModel.pagedExpenses.first().map { it.id })
        viewModel.clearFilters()
        advanceUntilIdle()
        assertEquals(5003, viewModel.pagedExpenses.first().size)
        assertEquals(RecordListPeriod.ALL_TIME.key, viewModel.uiState.value.toolbar.listPeriod)
    }

    @Test
    fun multiCategoryTypeCompatibility_andDeletionKeepOtherCriteria() = runTest(dispatcher) {
        val income = category.copy(id = "salary", transactionType = "income")
        fakeCategories.categoriesFlow.value = listOf(category, income)
        backgroundScope.launch { viewModel.uiState.collect {} }
        viewModel.uiState.first { !it.isLoading }
        viewModel.setCategoryFilters(setOf("c1", "salary"))
        viewModel.setSearchQuery("coffee")
        viewModel.setTypeFilter(TransactionTypeFilter.EXPENSE)
        advanceUntilIdle()
        assertEquals(setOf("c1"), viewModel.uiState.value.toolbar.composite.categoryIds)
        fakeCategories.categoriesFlow.value = listOf(income)
        advanceUntilIdle()
        assertEquals(emptySet<String>(), viewModel.uiState.value.toolbar.composite.categoryIds)
        assertEquals("coffee", viewModel.uiState.value.toolbar.searchQuery)
    }

    @Test
    fun delayedDeleteAndDuplicate_cannotWriteAfterAccountSwitch() = runTest(dispatcher) {
        val owner = MutableStateFlow<String?>("user-a")
        val actions = object : ExpenseActions by fakeExpenses {
            override val currentRecordAccountId: String? get() = owner.value
            override val recordAccountId: Flow<String?> = owner
        }
        val vm = ExpenseViewModel(fakeCategories, actions, fakePreferences)
        runCurrent()
        assertTrue(vm.softDelete(expense))
        owner.value = "user-b"
        advanceUntilIdle()
        var deleted: Boolean? = null
        var duplicated: Boolean? = null
        vm.commitSoftDelete(expense) { result, _ -> deleted = result }
        vm.duplicateExpense(expense) { result, _ -> duplicated = result }
        advanceUntilIdle()
        assertEquals(false, deleted)
        assertEquals(false, duplicated)
        assertEquals(null, fakeExpenses.lastDeletedId)
        assertFalse(vm.softDelete(expense))
    }

    private fun CategoryActions.withFlow(categories: Flow<List<Category>>): CategoryActions =
        object : CategoryActions by this {
            override val allCategories = categories
        }

    /** Each collector has an independently controllable channel, like a cold listener. */
    private class ColdCategoryFlow(@Volatile var initialSnapshot: List<Category> = emptyList()) {
        private val nextId = java.util.concurrent.atomic.AtomicInteger()
        private val channels = java.util.concurrent.ConcurrentHashMap<Int, Channel<List<Category>>>()
        val opened = Channel<Int>(Channel.UNLIMITED)
        val values: Flow<List<Category>> = flow {
            val id = nextId.incrementAndGet()
            val channel = Channel<List<Category>>(Channel.UNLIMITED)
            channels[id] = channel
            opened.trySend(id).getOrThrow()
            try {
                emit(initialSnapshot)
                for (snapshot in channel) emit(snapshot)
            } finally {
                channels.remove(id)
                channel.close()
            }
        }

        fun activeIds(): List<Int> = channels.keys().toList().sorted()
        fun emitTo(id: Int, snapshot: List<Category>) {
            channels.getValue(id).trySend(snapshot).getOrThrow()
        }
        fun emitToAll(snapshot: List<Category>) = activeIds().forEach { emitTo(it, snapshot) }
    }

    private class FakeCategoryActions : CategoryActions {
        val categoriesFlow = MutableStateFlow<List<Category>>(emptyList())
        override val allCategories: Flow<List<Category>> = categoriesFlow

        override suspend fun insertCategory(category: Category) = Result.success("id")
        override suspend fun updateCategory(category: Category) = Result.success(Unit)
        override suspend fun updateCategoriesBatch(categories: List<Category>) = Result.success(Unit)
        override suspend fun deleteCategory(category: Category) = Result.success(Unit)
        override suspend fun deduplicateCategories() = Result.success(Unit)
        override suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String) =
            Result.success(Unit)
        override suspend fun countExpensesForCategory(categoryId: String) = 0
    }

    private class FakeExpenseActions : ExpenseActions {
        val expenses = MutableStateFlow<List<Expense>>(emptyList())
        override val allExpenses: Flow<List<Expense>> = expenses
        override val dataTruncated: MutableStateFlow<Boolean> = MutableStateFlow(false)

        var duplicateResult: Result<Unit> = Result.success(Unit)
        var deleteResult: Result<Unit> = Result.success(Unit)
        var lastDeletedId: String? = null

        override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
            expenses.map { list -> list.filter { it.dateMillis >= startMillis && it.dateMillis < endMillis } }

        override suspend fun insertExpense(expense: Expense, idempotencyKey: String?) = Result.success("id")
        override suspend fun updateExpense(expense: Expense) = Result.success(Unit)

        override suspend fun deleteExpense(expense: Expense): Result<Unit> {
            return deleteResult.onSuccess {
                lastDeletedId = expense.id
                expenses.value = expenses.value.filterNot { it.id == expense.id }
            }
        }

        override suspend fun duplicateExpense(expense: Expense): Result<Unit> =
            duplicateResult

        override suspend fun sumMonthExpenses(excludeExpenseId: String) = 0.0
    }

    private class FakeTransactionPreferences : TransactionPreferences {
        val currency = MutableStateFlow("EUR")
        val monthlyBudget = MutableStateFlow<Double?>(null)
        val analyticsPeriod = MutableStateFlow("this_month")

        override val currencyFlow: Flow<String> = currency
        override val monthlyBudgetFlow: Flow<Double?> = monthlyBudget
        override val analyticsPeriodFlow: Flow<String> = analyticsPeriod

        override suspend fun updateAnalyticsPeriodKey(storageKey: String) {
            analyticsPeriod.value = storageKey
        }
    }
}
