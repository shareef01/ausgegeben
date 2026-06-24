package com.aus.ausgegeben.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppRepositoryReceiptTest {

    private lateinit var database: AusgegebenDatabase
    private lateinit var repository: AppRepository

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, AusgegebenDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = AppRepository(
            database.categoryDao(),
            database.expenseDao(),
            context.applicationContext
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun deleteExpense_removesExpenseRow() = runBlocking {
        val categoryId = insertCategory()
        val expense = expense(categoryId, "content://test/receipt-a.jpg")
        repository.insertExpense(expense)
        val stored = database.expenseDao().getAllExpenses().first().single()

        repository.deleteExpense(stored)

        assertEquals(0, database.expenseDao().getAllExpenses().first().size)
    }

    @Test
    fun purgeReceiptIfUnreferenced_skipsWhenAnotherExpenseReferencesPath() = runBlocking {
        val categoryId = insertCategory()
        val receiptPath = "content://test/shared-receipt.jpg"
        repository.insertExpense(expense(categoryId, receiptPath).copy(note = "First"))
        repository.insertExpense(expense(categoryId, receiptPath).copy(note = "Second"))
        val toDelete = database.expenseDao().getAllExpenses().first().first { it.note == "Second" }

        repository.deleteExpense(toDelete)

        assertEquals(1, database.expenseDao().countByReceiptPath(receiptPath, excludeId = 0L))
    }

    @Test
    fun updateExpense_replacesReceiptReferenceWhenPathChanges() = runBlocking {
        val categoryId = insertCategory()
        val oldPath = "content://test/old-receipt.jpg"
        val newPath = "content://test/new-receipt.jpg"
        repository.insertExpense(expense(categoryId, oldPath))
        val stored = database.expenseDao().getAllExpenses().first().single()

        repository.updateExpense(stored.copy(receiptImagePath = newPath))

        assertEquals(0, database.expenseDao().countByReceiptPath(oldPath, excludeId = stored.id))
        assertEquals(1, database.expenseDao().countByReceiptPath(newPath, excludeId = stored.id))
    }

    @Test
    fun duplicateExpense_leavesReceiptNullWhenCopyUnavailable() = runBlocking {
        val categoryId = insertCategory()
        repository.insertExpense(expense(categoryId, "content://missing/receipt.jpg"))
        val stored = database.expenseDao().getAllExpenses().first().single()

        repository.duplicateExpense(stored)

        val duplicate = database.expenseDao().getAllExpenses().first().first { it.id != stored.id }
        assertNull(duplicate.receiptImagePath)
    }

    private suspend fun insertCategory(): Long {
        return repository.insertCategory(
            Category(
                name = "Food",
                iconName = "restaurant",
                colorInt = 0xFFE57373.toInt()
            )
        )
    }

    private fun expense(categoryId: Long, receiptPath: String) = Expense(
        amount = 12.5,
        dateMillis = 1_700_000_000_000L,
        categoryId = categoryId,
        note = "Lunch",
        receiptImagePath = receiptPath
    )
}
