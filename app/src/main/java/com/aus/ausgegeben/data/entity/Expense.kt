package com.aus.ausgegeben.data.entity

import java.util.UUID

data class Expense(
    val id: String = UUID.randomUUID().toString(),
    val amount: Double,
    val dateMillis: Long,
    val categoryId: String,
    val note: String,
    val receiptImagePath: String? = null,
    /** expense | income | transfer */
    val transactionType: String = "expense"
)
