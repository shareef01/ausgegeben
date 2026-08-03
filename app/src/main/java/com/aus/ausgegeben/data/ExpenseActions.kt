package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Narrow expense surface used by the expense-related ViewModels (easy to fake in unit tests). */
interface ExpenseActions {
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
