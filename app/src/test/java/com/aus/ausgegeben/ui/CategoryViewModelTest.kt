package com.aus.ausgegeben.ui

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.entity.Category
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
 * Covers the ViewModel/repository glue around category writes — moveCategory in
 * particular, since both PERMISSION_DENIED rounds and the busy-guard regression
 * lived exactly here and none of it was reachable by CategoryReorderTest, which
 * only exercises the pure categoriesAfterMove function.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class CategoryViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var fakeActions: FakeCategoryActions
    private lateinit var viewModel: CategoryViewModel

    private val cat0 = Category(id = "c0", name = "Groceries", iconName = "cart", colorInt = 1, sortOrder = 0)
    private val cat1 = Category(id = "c1", name = "Dining", iconName = "food", colorInt = 2, sortOrder = 1)
    private val cat2 = Category(id = "c2", name = "Transport", iconName = "car", colorInt = 3, sortOrder = 2)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        fakeActions = FakeCategoryActions()
        val app = ApplicationProvider.getApplicationContext<Application>()
        viewModel = CategoryViewModel(app, fakeActions)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun moveCategory_writesTheComputedMoveThroughOneBatch() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0, cat1, cat2))
        viewModel.moveCategory(cat1, moveUp = true)
        advanceUntilIdle()

        assertEquals(1, fakeActions.batchCallCount)
        val written = fakeActions.lastBatchArg.orEmpty().associateBy { it.id }
        assertEquals(0, written["c1"]?.sortOrder)
        assertEquals(1, written["c0"]?.sortOrder)
    }

    @Test
    fun moveCategory_atTheBoundary_writesNothing() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0, cat1, cat2))
        viewModel.moveCategory(cat0, moveUp = true)
        advanceUntilIdle()

        assertTrue(fakeActions.lastBatchArg.orEmpty().isEmpty())
    }

    /**
     * The regression this guards: a second tap while the first move's read+write is
     * still in flight used to compute its own move from data the first tap's writes
     * hadn't landed in yet. moveCategory's check-and-set is synchronous (not a suspend
     * function), so calling it twice back-to-back here — before advanceUntilIdle lets
     * either coroutine run — must leave the second call a no-op.
     */
    @Test
    fun moveCategory_secondCallWhileFirstInFlight_isIgnored() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0, cat1, cat2))
        viewModel.moveCategory(cat1, moveUp = true)
        viewModel.moveCategory(cat1, moveUp = false)
        advanceUntilIdle()

        assertEquals(1, fakeActions.batchCallCount)
    }

    @Test
    fun moveCategory_clearsIsReorderingAfterSuccess() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0, cat1, cat2))
        viewModel.moveCategory(cat1, moveUp = true)
        advanceUntilIdle()

        assertFalse(viewModel.isReordering.value)
    }

    @Test
    fun moveCategory_clearsIsReorderingAndSetsErrorAfterFailure() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0, cat1, cat2))
        fakeActions.batchResult = Result.failure(RuntimeException("PERMISSION_DENIED"))
        viewModel.moveCategory(cat1, moveUp = true)
        advanceUntilIdle()

        assertFalse(viewModel.isReordering.value)
        assertEquals(
            appString(R.string.category_error_reorder_failed),
            viewModel.errorMessage.value,
        )
    }

    @Test
    fun addCategory_success_invokesCallback() = runTest(dispatcher) {
        var added: Category? = null
        viewModel.addCategory("Rent", "home", 1, "expense") { added = it }
        advanceUntilIdle()

        assertTrue(fakeActions.insertCalled)
        assertEquals("Rent", added?.name)
        assertNull(viewModel.errorMessage.value)
    }

    @Test
    fun addCategory_failure_setsErrorMessage() = runTest(dispatcher) {
        fakeActions.insertResult = Result.failure(RuntimeException("boom"))
        viewModel.addCategory("Rent", "home", 1, "expense")
        advanceUntilIdle()

        assertEquals(
            appString(R.string.category_error_add_failed),
            viewModel.errorMessage.value,
        )
    }

    @Test
    fun addCategory_invalidName_setsErrorMessageAndDoesNotInsert() = runTest(dispatcher) {
        viewModel.addCategory("--->", "home", 1, "expense")
        advanceUntilIdle()

        assertFalse(fakeActions.insertCalled)
        assertEquals(
            appString(R.string.category_error_add_failed),
            viewModel.errorMessage.value,
        )
    }

    @Test
    fun updateCategory_invalidName_setsErrorMessageAndDoesNotUpdate() = runTest(dispatcher) {
        viewModel.updateCategory(cat0.copy(name = ";;;"))
        advanceUntilIdle()

        assertEquals(
            appString(R.string.category_error_update_failed),
            viewModel.errorMessage.value,
        )
    }

    @Test
    fun updateCategory_transactionTypeChanged_alsoRetypesExpenses() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0))
        viewModel.updateCategory(cat0.copy(transactionType = "income"))
        advanceUntilIdle()

        assertTrue(fakeActions.updateExpenseTypesCalled)
    }

    @Test
    fun updateCategory_transactionTypeUnchanged_doesNotRetypeExpenses() = runTest(dispatcher) {
        fakeActions.setCategories(listOf(cat0))
        viewModel.updateCategory(cat0.copy(name = "Renamed"))
        advanceUntilIdle()

        assertFalse(fakeActions.updateExpenseTypesCalled)
    }

    @Test
    fun deleteCategory_failure_setsErrorMessage() = runTest(dispatcher) {
        fakeActions.deleteResult = Result.failure(RuntimeException("boom"))
        viewModel.deleteCategory(cat0)
        advanceUntilIdle()

        assertEquals(
            appString(R.string.category_error_delete_failed),
            viewModel.errorMessage.value,
        )
    }

    @Test
    fun deduplicateCategories_failure_setsErrorMessage() = runTest(dispatcher) {
        fakeActions.dedupeResult = Result.failure(RuntimeException("boom"))
        viewModel.deduplicateCategories()
        advanceUntilIdle()

        assertEquals(
            appString(R.string.category_error_deduplicate_failed),
            viewModel.errorMessage.value,
        )
    }

    private fun appString(id: Int): String =
        ApplicationProvider.getApplicationContext<Application>().getString(id)

    private class FakeCategoryActions : CategoryActions {
        private val categoriesFlow = MutableStateFlow<List<Category>>(emptyList())
        override val allCategories: Flow<List<Category>> = categoriesFlow

        var insertResult: Result<String> = Result.success("new-id")
        var updateResult: Result<Unit> = Result.success(Unit)
        var batchResult: Result<Unit> = Result.success(Unit)
        var deleteResult: Result<Unit> = Result.success(Unit)
        var dedupeResult: Result<Unit> = Result.success(Unit)
        var updateExpenseTypesResult: Result<Unit> = Result.success(Unit)
        var countResult: Int = 0

        var insertCalled = false
        var updateExpenseTypesCalled = false
        var batchCallCount = 0
        var lastBatchArg: List<Category>? = null

        fun setCategories(list: List<Category>) {
            categoriesFlow.value = list
        }

        override suspend fun insertCategory(category: Category): Result<String> {
            insertCalled = true
            return insertResult
        }

        override suspend fun updateCategory(category: Category): Result<Unit> {
            return updateResult
        }

        override suspend fun updateCategoriesBatch(categories: List<Category>): Result<Unit> {
            batchCallCount++
            lastBatchArg = categories
            return batchResult
        }

        override suspend fun deleteCategory(category: Category): Result<Unit> {
            return deleteResult
        }

        override suspend fun deduplicateCategories(): Result<Unit> {
            return dedupeResult
        }

        override suspend fun updateExpenseTypesForCategory(
            categoryId: String,
            transactionType: String,
        ): Result<Unit> {
            updateExpenseTypesCalled = true
            return updateExpenseTypesResult
        }

        override suspend fun countExpensesForCategory(categoryId: String): Int = countResult
    }
}
