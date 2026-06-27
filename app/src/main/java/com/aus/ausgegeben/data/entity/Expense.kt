package com.aus.ausgegeben.data.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "expenses",
    foreignKeys = [
        ForeignKey(
            entity = Category::class,
            parentColumns = ["id"],
            childColumns = ["categoryId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["categoryId"]),
        Index(value = ["transactionType"]),
        Index(value = ["dateMillis"])
    ]
)
data class Expense(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val amount: Double,
    val dateMillis: Long,
    val categoryId: Long,
    val note: String,
    val receiptImagePath: String? = null,
    /** expense | income | transfer */
    val transactionType: String = "expense",
    val updatedAt: Long = 0
)
