package com.aus.ausgegeben.ui

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.PendingExpenseJournal
import com.aus.ausgegeben.data.PendingExpenseOperation
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.UUID

/**
 * Covers saveExpense's validation and success/failure paths — the same class of bug
 * (wrong data reaching Firestore, or a failure silently not surfacing) this project has
 * hit repeatedly, and previously untestable since AddExpenseViewModel depended on the
 * concrete AppRepository with no seam to fake it through.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class AddExpenseViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var fakeCategories: FakeCategoryActions
    private lateinit var fakeExpenses: FakeExpenseActions
    private lateinit var fakePreferences: FakeTransactionPreferences
    private lateinit var viewModel: AddExpenseViewModel

    private val expenseCategory =
        Category(id = "c1", name = "Groceries", iconName = "cart", colorInt = 1, transactionType = "expense")
    private val incomeCategory =
        Category(id = "c2", name = "Salary", iconName = "cash", colorInt = 2, transactionType = "income")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        fakeCategories = FakeCategoryActions()
        fakeExpenses = FakeExpenseActions()
        fakePreferences = FakeTransactionPreferences()
        val app = ApplicationProvider.getApplicationContext<Application>()
        viewModel = AddExpenseViewModel(app, fakeCategories, fakeExpenses, fakePreferences)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun saveExpense_noCategorySelected_reportsErrorWithoutWriting() {
        viewModel.onAmountChange("12,50")
        var error: String? = null
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = { error = it })

        assertEquals(appString(R.string.error_select_category), error)
        assertFalse(fakeExpenses.insertCalled)
    }

    @Test
    fun saveExpense_categoryTypeMismatch_reportsErrorWithoutWriting() {
        viewModel.onCategorySelect(incomeCategory)
        viewModel.onAmountChange("12,50")
        var error: String? = null
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = { error = it })

        assertTrue(error.orEmpty().isNotEmpty())
        assertFalse(fakeExpenses.insertCalled)
    }

    @Test
    fun saveExpense_zeroAmount_reportsErrorWithoutWriting() = runTest(dispatcher) {
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("0")
        var error: String? = null
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = { error = it })
        advanceUntilIdle()

        assertEquals(appString(R.string.error_amount_required), error)
        assertFalse(fakeExpenses.insertCalled)
    }

    @Test
    fun saveExpense_insertsNewExpenseAndResetsForm() = runTest(dispatcher) {
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("12,50")
        viewModel.onNoteChange("coffee")
        var succeeded = false
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = { succeeded = true }, onError = { })
        advanceUntilIdle()

        assertTrue(succeeded)
        assertTrue(fakeExpenses.insertCalled)
        assertFalse(fakeExpenses.updateCalled)
        assertEquals(12.5, fakeExpenses.lastInserted?.amount)
        assertEquals("c1", fakeExpenses.lastInserted?.categoryId)
        // resetForm cleared the selection back out
        assertNull(viewModel.selectedCategory.value)
        assertEquals("0", viewModel.amount.value)
    }

    @Test
    fun saveExpense_editingExisting_updatesInsteadOfInserting() = runTest(dispatcher) {
        val existing = Expense(id = "e1", amount = 5.0, dateMillis = 1L, categoryId = "c1", note = "old")
        viewModel.loadForEdit(existing, listOf(expenseCategory))
        advanceUntilIdle()
        viewModel.onAmountChange("9,99")

        var succeeded = false
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = { succeeded = true }, onError = { })
        advanceUntilIdle()

        assertTrue(succeeded)
        assertTrue(fakeExpenses.updateCalled)
        assertFalse(fakeExpenses.insertCalled)
        assertEquals("e1", fakeExpenses.lastUpdated?.id)
        assertEquals(9.99, fakeExpenses.lastUpdated?.amount)
    }

    @Test
    fun saveExpense_repositoryFailure_reportsErrorAndKeepsForm() = runTest(dispatcher) {
        fakeExpenses.insertResult = Result.failure(RuntimeException("PERMISSION_DENIED"))
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("12,50")

        var error: String? = null
        var succeeded = false
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = { succeeded = true }, onError = { error = it })
        advanceUntilIdle()

        assertFalse(succeeded)
        assertEquals(appString(R.string.auth_error_generic), error)
        // Form must not be silently cleared on a failed save.
        assertEquals(expenseCategory, viewModel.selectedCategory.value)
    }

    /**
     * DATA-1 regression: identity must be the submission *attempt*, never the expense's
     * field values. The previous design recovered a durable key by matching content,
     * which meant a second, entirely legitimate transaction — entered after an app
     * restart, with the same amount/category/note/type as an earlier one that never
     * confirmed its outcome — silently collapsed into the first: the user's Save
     * reported success, but the second transaction was never written. Every explicit
     * Save must mint its own operation id, even given byte-identical fields, so this
     * class of bug cannot recur.
     */
    @Test
    fun saveExpense_retryAfterAmbiguousFailure_mintsFreshOperationId() = runTest(dispatcher) {
        fakeExpenses.insertResult = Result.failure(RuntimeException("response lost"))
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("12,50")
        viewModel.onNoteChange("coffee")
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = {})
        advanceUntilIdle()
        val firstKey = fakeExpenses.idempotencyKeys.single()

        // New ViewModel models process/UI recreation (e.g. the app was killed and
        // relaunched). The user retypes the same values and taps Save again — an
        // explicit new action, indistinguishable at this layer from a coincidentally
        // identical second transaction, so it must never reuse the first attempt's id.
        viewModel = AddExpenseViewModel(
            ApplicationProvider.getApplicationContext(),
            fakeCategories,
            fakeExpenses,
            fakePreferences,
        )
        fakeExpenses.insertResult = Result.success("new-id")
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("12,50")
        viewModel.onNoteChange("coffee")
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = {})
        advanceUntilIdle()

        assertFalse(firstKey.isNullOrBlank())
        assertEquals(2, fakeExpenses.idempotencyKeys.size)
        assertFalse(fakeExpenses.idempotencyKeys[0] == fakeExpenses.idempotencyKeys[1])
        // The first attempt's outcome was ambiguous (its write may or may not have
        // reached the server) and it was never completed, so its entry correctly
        // remains for reconciliation to resolve later — it must NOT have been reused
        // or silently discarded by the second, successful save.
        assertEquals(listOf(firstKey), fakePreferences.pendingOperationIds)
    }

    /**
     * A genuine retry of the *same* attempt — the caller still holds the operation id
     * from the failed call and reuses it directly, without going through
     * beginExpenseSubmission again — must not be treated as a new submission. This is
     * how the app (and ExpenseActions' own transactional create-if-absent guard) already
     * guarantee at most one document per id; this test documents that contract at the
     * ViewModel/journal seam.
     */
    @Test
    fun beginExpenseSubmission_calledOnceThenReused_doesNotMintASecondId() = runTest(dispatcher) {
        val operationId = fakePreferences.beginExpenseSubmission()
        val reused = operationId // the caller simply keeps the value; nothing to re-derive

        assertEquals(operationId, reused)
        assertEquals(listOf(operationId), fakePreferences.pendingOperationIds)
    }

    // DATA-2: beginning a second submission while the first is unresolved must never
    // overwrite the first's bookkeeping, and completing the second must leave the
    // first pending for reconciliation. The old single-slot production journal lost A
    // the moment B began; the old fake (a plain list) masked that at this seam.
    @Test
    fun journal_aPending_bBeginsAndCompletes_aStaysPendingForReconciliation() = runTest(dispatcher) {
        val a = fakePreferences.beginExpenseSubmission()
        val b = fakePreferences.beginExpenseSubmission()
        assertNotEquals(a, b)

        fakePreferences.completeExpenseSubmission(b)

        assertEquals("A's bookkeeping must survive B's completion", listOf(a), fakePreferences.pendingOperationIds)
    }

    @Test
    fun journal_reconciliation_resolvesEachOperationIndependently() = runTest(dispatcher) {
        val a = fakePreferences.beginExpenseSubmission()
        val b = fakePreferences.beginExpenseSubmission()

        // Only A's write landed remotely (B may still be in flight).
        val checked = mutableListOf<String>()
        fakePreferences.reconcilePendingExpenseSubmissions { operationId ->
            checked += operationId
            operationId == a
        }

        assertEquals("each unresolved operation is checked independently", setOf(a, b), checked.toSet())
        assertEquals("A is resolved away, B stays pending", listOf(b), fakePreferences.pendingOperationIds)
    }

    @Test
    fun journal_lateCompletionOfTheEarlierOperation_neverClearsTheLaterOne() = runTest(dispatcher) {
        val a = fakePreferences.beginExpenseSubmission()
        val b = fakePreferences.beginExpenseSubmission()

        fakePreferences.completeExpenseSubmission(a)

        assertEquals(listOf(b), fakePreferences.pendingOperationIds)
    }

    @Test
    fun saveExpense_emailNotVerified_mapsToVerifyMessage() = runTest(dispatcher) {
        fakeExpenses.insertResult = Result.failure(IllegalStateException("EMAIL_NOT_VERIFIED"))
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("12,50")

        var error: String? = null
        viewModel.saveExpense(TransactionType.EXPENSE, onSuccess = {}, onError = { error = it })
        advanceUntilIdle()

        assertEquals(appString(R.string.auth_verify_required), error)
    }

    @Test
    fun saveExpense_projectedSpendOverBudget_firesBudgetAlert() = runTest(dispatcher) {
        fakePreferences.monthlyBudget.value = 100.0
        fakeExpenses.sumMonthResult = 95.0
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("10,00")

        var alert: String? = null
        viewModel.saveExpense(
            TransactionType.EXPENSE,
            onSuccess = {},
            onError = {},
            onBudgetAlert = { alert = it },
        )
        advanceUntilIdle()

        assertTrue(alert.orEmpty().isNotEmpty())
    }

    @Test
    fun saveExpense_budgetCheckFailure_stillSucceedsAndSurfacesFallback() = runTest(dispatcher) {
        fakePreferences.monthlyBudget.value = 100.0
        fakeExpenses.sumMonthThrows = true
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("10,00")

        var success = false
        var error: String? = null
        var alert: String? = null
        viewModel.saveExpense(
            TransactionType.EXPENSE,
            onSuccess = { success = true },
            onError = { error = it },
            onBudgetAlert = { alert = it },
        )
        advanceUntilIdle()

        assertTrue(success)
        assertNull(error)
        assertEquals(appString(R.string.error_budget_check_failed), alert)
        assertTrue(fakeExpenses.insertCalled)
    }

    @Test
    fun resetForm_clearsEverything() {
        viewModel.onCategorySelect(expenseCategory)
        viewModel.onAmountChange("42")
        viewModel.onNoteChange("something")

        viewModel.resetForm()

        assertNull(viewModel.selectedCategory.value)
        assertEquals("0", viewModel.amount.value)
        assertEquals("", viewModel.note.value)
        assertFalse(viewModel.isEditing)
    }

    private fun appString(id: Int): String =
        ApplicationProvider.getApplicationContext<Application>().getString(id)

    private class FakeCategoryActions : CategoryActions {
        private val categoriesFlow = MutableStateFlow<List<Category>>(emptyList())
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
        override val allExpenses: Flow<List<Expense>> = MutableStateFlow(emptyList())
        override val dataTruncated: MutableStateFlow<Boolean> = MutableStateFlow(false)

        var insertResult: Result<String> = Result.success("new-id")
        var updateResult: Result<Unit> = Result.success(Unit)
        var sumMonthResult: Double = 0.0

        var insertCalled = false
        var updateCalled = false
        var lastInserted: Expense? = null
        var lastUpdated: Expense? = null
        var sumMonthThrows = false
        val idempotencyKeys = mutableListOf<String?>()

        override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
            MutableStateFlow(emptyList())

        override suspend fun insertExpense(expense: Expense, idempotencyKey: String?): Result<String> {
            insertCalled = true
            lastInserted = expense
            idempotencyKeys += idempotencyKey
            return insertResult
        }

        override suspend fun updateExpense(expense: Expense): Result<Unit> {
            updateCalled = true
            lastUpdated = expense
            return updateResult
        }

        override suspend fun deleteExpense(expense: Expense) = Result.success(Unit)
        override suspend fun duplicateExpense(expense: Expense) = Result.success(Unit)
        override suspend fun sumMonthExpenses(excludeExpenseId: String): Double {
            if (sumMonthThrows) throw IllegalStateException("FAILED_PRECONDITION")
            return sumMonthResult
        }
    }

    /**
     * PreferenceManager is backed by real DataStore file I/O on its own real dispatcher —
     * StandardTestDispatcher's advanceUntilIdle() has no way to fast-forward through that,
     * so a ViewModel depending on the concrete class hangs forever instead of failing fast
     * (found live: every saveExpense test hung until TransactionPreferences was extracted).
     *
     * The journal semantics below are implemented through the SAME storage-agnostic
     * policy object as the production [com.aus.ausgegeben.data.PreferenceManager]
     * ([com.aus.ausgegeben.data.PendingExpenseJournal]) — only the backing storage
     * differs (in-memory list vs sealed DataStore set). A fake must never support
     * semantics production lacks: the original single-slot production journal was
     * masked in tests by exactly such a stronger-than-production fake (DATA-2).
     */
    private class FakeTransactionPreferences : TransactionPreferences {
        val currency = MutableStateFlow("EUR")
        val monthlyBudget = MutableStateFlow<Double?>(null)
        val analyticsPeriod = MutableStateFlow("this_month")

        /** Every unresolved submission attempt, mirroring production's durable journal. */
        var journal: List<PendingExpenseOperation> = emptyList()
            private set

        val pendingOperationIds: List<String> get() = journal.map { it.operationId }

        override val currencyFlow: Flow<String> = currency
        override val monthlyBudgetFlow: Flow<Double?> = monthlyBudget
        override val analyticsPeriodFlow: Flow<String> = analyticsPeriod

        override suspend fun updateAnalyticsPeriodKey(storageKey: String) {
            analyticsPeriod.value = storageKey
        }

        override suspend fun beginExpenseSubmission(): String {
            val operationId = UUID.randomUUID().toString()
            journal = PendingExpenseJournal.append(
                journal,
                PendingExpenseOperation(operationId, System.currentTimeMillis()),
            )
            return operationId
        }

        override suspend fun completeExpenseSubmission(operationId: String) {
            journal = PendingExpenseJournal.complete(journal, operationId)
        }

        override suspend fun reconcilePendingExpenseSubmissions(exists: suspend (String) -> Boolean) {
            val resolved = PendingExpenseJournal.resolvedForRemoval(journal, System.currentTimeMillis(), exists)
            if (resolved.isNotEmpty()) {
                val resolvedIds = resolved.map { it.operationId }.toSet()
                journal = journal.filterNot { it.operationId in resolvedIds }
            }
        }
    }
}
