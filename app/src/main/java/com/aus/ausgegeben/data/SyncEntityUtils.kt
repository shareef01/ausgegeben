package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import java.util.UUID

fun Category.ensureCloudId(): Category =
    if (cloudId.isBlank()) copy(cloudId = UUID.randomUUID().toString()) else this

fun Category.stampedForSync(): Category =
    ensureCloudId().copy(updatedAt = System.currentTimeMillis(), pendingSync = true)

fun Expense.ensureCloudId(): Expense =
    if (cloudId.isBlank()) copy(cloudId = UUID.randomUUID().toString()) else this

fun Expense.stampedForSync(): Expense =
    ensureCloudId().copy(updatedAt = System.currentTimeMillis(), pendingSync = true)
