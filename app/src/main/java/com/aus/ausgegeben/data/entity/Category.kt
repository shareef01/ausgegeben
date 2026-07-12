package com.aus.ausgegeben.data.entity

data class Category(
    val id: Long = 0,
    val name: String,
    val iconName: String,
    val colorInt: Int,
    /** expense | income | transfer */
    val transactionType: String = "expense",
    val sortOrder: Int = 0
)
