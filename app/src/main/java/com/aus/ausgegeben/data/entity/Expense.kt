package com.aus.ausgegeben.data.entity

data class Expense(
    val id: Long = 0,
    val amount: Double,
    val dateMillis: Long,
    val categoryId: Long,
    val note: String,
    val receiptImagePath: String? = null,
    /** expense | income | transfer */
    val transactionType: String = "expense"
)
