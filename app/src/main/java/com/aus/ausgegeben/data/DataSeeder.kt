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
                cat("Groceries", "shopping_cart", 0xFFFF8A7A.toInt(), expense, 0),
                cat("Shopping", "shopping_bag", 0xFFFFBE7A.toInt(), expense, 1),
                cat("Dining", "restaurant", 0xFFE89BC4.toInt(), expense, 2),
                cat("Transport", "car", 0xFF6EC8E8.toInt(), expense, 3),
                cat("Bills", "bolt", 0xFF9B8FEF.toInt(), expense, 4),
                cat("Subscriptions", "subscriptions", 0xFF7BC8B5.toInt(), expense, 5),
                cat("Salary", "credit_card", 0xFF5ED49A.toInt(), income, 0),
                cat("Freelance", "work", 0xFF72AEFF.toInt(), income, 1),
                cat("Refunds", "undo", 0xFFD4A96A.toInt(), income, 2),
                cat("Transfer", "swap_horiz", 0xFF9B9BA8.toInt(), transfer, 0)
            )
        )
    }
}
