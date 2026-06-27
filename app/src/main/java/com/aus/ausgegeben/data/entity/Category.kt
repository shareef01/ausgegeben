package com.aus.ausgegeben.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "categories")
data class Category(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val iconName: String,
    val colorInt: Int,
    /** expense | income | transfer */
    val transactionType: String = "expense",
    val sortOrder: Int = 0,
    val updatedAt: Long = 0
)
