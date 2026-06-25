package com.aus.ausgegeben.data.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.aus.ausgegeben.data.entity.Expense
import kotlinx.coroutines.flow.Flow

@Dao
interface ExpenseDao {
    @Query(
        """
        SELECT e.* FROM expenses e
        LEFT JOIN categories c ON e.categoryId = c.id
        WHERE e.dateMillis >= :startMillis
          AND e.dateMillis < :endMillis
          AND (:typeFilter = '' OR e.transactionType = :typeFilter)
          AND (
            :searchPattern = ''
            OR LOWER(e.note) LIKE :searchPattern
            OR LOWER(IFNULL(c.name, '')) LIKE :searchPattern
            OR CAST(e.amount AS TEXT) LIKE :searchPattern
          )
        ORDER BY e.dateMillis DESC
        LIMIT :limit OFFSET :offset
        """
    )
    suspend fun getExpensesPage(
        startMillis: Long,
        endMillis: Long,
        typeFilter: String,
        searchPattern: String,
        limit: Int,
        offset: Int
    ): List<Expense>

    @Query("SELECT * FROM expenses ORDER BY dateMillis DESC")
    fun getAllExpenses(): Flow<List<Expense>>

    @Query(
        "SELECT * FROM expenses WHERE dateMillis >= :startMillis AND dateMillis < :endMillis " +
            "ORDER BY dateMillis DESC"
    )
    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>>

    @Query("SELECT * FROM expenses WHERE categoryId = :categoryId ORDER BY dateMillis DESC")
    fun getExpensesByCategory(categoryId: Long): Flow<List<Expense>>

    @Query("SELECT * FROM expenses WHERE categoryId = :categoryId")
    suspend fun getExpensesForCategory(categoryId: Long): List<Expense>

    @Query("SELECT * FROM expenses WHERE id = :id")
    suspend fun getById(id: Long): Expense?

    @Query(
        "SELECT COUNT(*) FROM expenses WHERE receiptImagePath = :path AND id != :excludeId"
    )
    suspend fun countByReceiptPath(path: String, excludeId: Long): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(expense: Expense)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(expenses: List<Expense>)

    @Delete
    suspend fun delete(expense: Expense)

    @androidx.room.Update
    suspend fun update(expense: Expense)

    @Query("SELECT COUNT(*) FROM expenses WHERE categoryId = :categoryId")
    suspend fun countByCategory(categoryId: Long): Int

    @Query("SELECT COUNT(*) FROM expenses WHERE dateMillis >= :startMillis AND dateMillis < :endMillis")
    suspend fun countInDateRange(startMillis: Long, endMillis: Long): Int

    @Query(
        """
        SELECT COALESCE(SUM(amount), 0) FROM expenses
        WHERE dateMillis >= :startMillis AND dateMillis < :endMillis
          AND transactionType = 'expense'
          AND (:excludeId = 0 OR id != :excludeId)
        """
    )
    suspend fun sumExpensesInRange(
        startMillis: Long,
        endMillis: Long,
        excludeId: Long = 0L,
    ): Double

    @Query("UPDATE expenses SET transactionType = :transactionType WHERE categoryId = :categoryId")
    suspend fun updateTransactionTypeForCategory(categoryId: Long, transactionType: String)
}
