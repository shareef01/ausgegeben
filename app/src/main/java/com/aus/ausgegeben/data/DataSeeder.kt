package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.TransactionType
import kotlinx.coroutines.flow.first

object DataSeeder {
    suspend fun seedIfEmpty(repository: AppRepository) {
        val categories = repository.allCategories.first()
        if (categories.isNotEmpty()) return

        val expense = TransactionType.EXPENSE.storageKey
        val income = TransactionType.INCOME.storageKey
        val transfer = TransactionType.TRANSFER.storageKey

        fun cat(name: String, icon: String, color: Int, type: String, order: Int) =
            Category(
                name = name,
                iconName = icon,
                colorInt = color,
                transactionType = type,
                sortOrder = order
            )

        repository.insertAllCategories(
            listOf(
                cat("Groceries", "shopping_cart", 0xFFE86B5A.toInt(), expense, 0),
                cat("Shopping", "shopping_bag", 0xFFE8A060.toInt(), expense, 1),
                cat("Dining", "restaurant", 0xFFD4849A.toInt(), expense, 2),
                cat("Transport", "car", 0xFF6A9FD4.toInt(), expense, 3),
                cat("Bills", "bolt", 0xFF9A8FD4.toInt(), expense, 4),
                cat("Subscriptions", "subscriptions", 0xFF5AB8AA.toInt(), expense, 5),
                cat("Salary", "credit_card", 0xFF5CB88A.toInt(), income, 0),
                cat("Freelance", "work", 0xFF6A9FD4.toInt(), income, 1),
                cat("Refunds", "undo", 0xFFB8A060.toInt(), income, 2),
                cat("Transfer", "swap_horiz", 0xFF8E8E96.toInt(), transfer, 0)
            )
        )
    }
}
