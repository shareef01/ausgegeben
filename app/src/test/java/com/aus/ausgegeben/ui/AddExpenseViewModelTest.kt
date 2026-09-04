package com.aus.ausgegeben.ui

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

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

        override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
            MutableStateFlow(emptyList())

        override suspend fun insertExpense(expense: Expense, idempotencyKey: String?): Result<String> {
            insertCalled = true
            lastInserted = expense
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
     */
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
