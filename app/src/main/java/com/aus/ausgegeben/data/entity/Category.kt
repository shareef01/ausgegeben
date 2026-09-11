package com.aus.ausgegeben.data.entity

import java.util.UUID

data class Category(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val iconName: String,
    val colorInt: Int,
    /** expense | income | transfer */
    val transactionType: String = "expense",
    val sortOrder: Int = 0,
    /** Present only while a crash-resumable category type migration is running. */
    val migrationState: String? = null,
    val pendingTransactionType: String? = null,
)
