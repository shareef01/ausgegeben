package com.aus.ausgegeben.data.entity

import java.util.UUID

data class Category(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val iconName: String,
    val colorInt: Int,
    /** expense | income | transfer */
    val transactionType: String = "expense",
    val sortOrder: Int = 0
)
