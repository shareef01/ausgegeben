package com.aus.ausgegeben.data.entity

import androidx.room.ColumnInfo

/** Lightweight aggregate used to detect expense table changes without loading all rows. */
data class ExpenseTableStamp(
    @ColumnInfo(name = "row_count") val rowCount: Int,
    @ColumnInfo(name = "checksum") val checksum: Double,
)
