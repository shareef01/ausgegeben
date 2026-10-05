package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Narrow expense surface used by the expense-related ViewModels (easy to fake in unit tests). */
interface ExpenseActions {
    fun getRecordExpensesInRange(start: Long, end: Long): Flow<List<Expense>> = getExpensesInRange(start, end)
    val recordExpenses: Flow<List<Expense>> get() = allExpenses
    val recordIncomplete: StateFlow<Boolean> get() = kotlinx.coroutines.flow.MutableStateFlow(false)
    val currentRecordAccountId: String? get() = null
    suspend fun deleteRecordExpense(expense: Expense, expectedUid: String): Result<Unit> = deleteExpense(expense)
    suspend fun duplicateRecordExpense(expense: Expense, expectedUid: String): Result<Unit> = duplicateExpense(expense)
    val recordAccountId: Flow<String?> get() = kotlinx.coroutines.flow.emptyFlow()
    val allExpenses: Flow<List<Expense>>

    /** True while a capped listener actually hit the row cap. See AppRepository.dataTruncated. */
    val dataTruncated: StateFlow<Boolean>

    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>>
    suspend fun insertExpense(expense: Expense, idempotencyKey: String? = null): Result<String>
    suspend fun updateExpense(expense: Expense): Result<Unit>
    suspend fun deleteExpense(expense: Expense): Result<Unit>
    suspend fun duplicateExpense(expense: Expense): Result<Unit>
    suspend fun sumMonthExpenses(excludeExpenseId: String = ""): Double
}
