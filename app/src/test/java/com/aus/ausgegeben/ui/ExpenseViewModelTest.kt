package com.aus.ausgegeben.ui

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
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
        val expenses = MutableStateFlow<List<Expense>>(emptyList())
        override val allExpenses: Flow<List<Expense>> = expenses
        override val dataTruncated: MutableStateFlow<Boolean> = MutableStateFlow(false)

        var duplicateResult: Result<Unit> = Result.success(Unit)
        var deleteResult: Result<Unit> = Result.success(Unit)
        var lastDeletedId: String? = null

        // The exact date range is irrelevant to these tests — always serve the same
        // seeded list regardless of which period the ViewModel queries for.
        override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> = expenses

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
