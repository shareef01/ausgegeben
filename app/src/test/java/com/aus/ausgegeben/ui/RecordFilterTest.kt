package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecordFilterTest {

    @Test
    fun transactionTypeFilter_matchesExpectedTypes() {
        val expense = Expense(amount = 1.0, dateMillis = 0L, categoryId = "1", note = "", transactionType = "expense")
        val income = expense.copy(transactionType = "income")
        val transfer = expense.copy(transactionType = "transfer")

        assertTrue(TransactionTypeFilter.ALL.matches(expense))
        assertTrue(TransactionTypeFilter.EXPENSE.matches(expense))
        assertFalse(TransactionTypeFilter.INCOME.matches(expense))
        assertTrue(TransactionTypeFilter.TRANSFER.matches(transfer))
        assertFalse(TransactionTypeFilter.EXPENSE.matches(income))
    }

    @Test
    fun filterByQuery_matchesNoteAmountAndCategory() {
        val items = listOf(
            Expense(amount = 12.5, dateMillis = 0L, categoryId = "1", note = "Coffee shop", transactionType = "expense"),
            Expense(amount = 3.0, dateMillis = 0L, categoryId = "2", note = "Bus", transactionType = "expense"),
        )
        val filtered = items.filterByQuery("coffee", mapOf("1" to "Food"))
        assertEquals(1, filtered.size)
        assertEquals("Coffee shop", filtered.first().note)
    }
}

class TransactionTypeTest {

    @Test
    fun fromKey_unknownDefaultsToExpense() {
        assertEquals(TransactionType.EXPENSE, TransactionType.fromKey("unknown"))
    }

    @Test
    fun categoryGroups_matchesTransactionType() {
        val category = Category(id = "1", name = "Food", iconName = "food", colorInt = 0, transactionType = "expense", sortOrder = 0)
        assertTrue(CategoryGroups.matches(TransactionType.EXPENSE, category))
        assertFalse(CategoryGroups.matches(TransactionType.INCOME, category))
    }

    @Test
    fun expenseTypeHelpers() {
        val expense = Expense(amount = 1.0, dateMillis = 0L, categoryId = "1", note = "", transactionType = "income")
        assertTrue(expense.isIncome())
        assertFalse(expense.isExpense())
        assertFalse(expense.isTransfer())
    }
}
