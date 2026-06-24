package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.entity.Category
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import com.aus.ausgegeben.util.normalizeArgbInt
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CategoryViewModel(
    private val repository: AppRepository
) : ViewModel() {

    val categories: StateFlow<List<Category>> = repository.allCategories
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    fun addCategory(
        name: String,
        iconName: String,
        colorInt: Int,
        transactionType: String,
        onAdded: ((Category) -> Unit)? = null
    ) {
        viewModelScope.launch {
            val sameType = repository.allCategories.first()
                .filter { it.transactionType == transactionType }
            val nextOrder = (sameType.maxOfOrNull { it.sortOrder } ?: -1) + 1
            val id = repository.insertCategory(
                Category(
                    name = name,
                    iconName = iconName,
                    colorInt = normalizeArgbInt(colorInt),
                    transactionType = transactionType,
                    sortOrder = nextOrder
                )
            )
            onAdded?.invoke(
                Category(
                    id = id,
                    name = name,
                    iconName = iconName,
                    colorInt = normalizeArgbInt(colorInt),
                    transactionType = transactionType,
                    sortOrder = nextOrder
                )
            )
        }
    }

    fun updateCategory(category: Category) {
        viewModelScope.launch {
            val existing = repository.allCategories.first().find { it.id == category.id }
            val normalized = category.copy(colorInt = normalizeArgbInt(category.colorInt))
            repository.updateCategory(normalized)
            if (existing != null && existing.transactionType != normalized.transactionType) {
                repository.updateExpenseTypesForCategory(
                    normalized.id,
                    normalized.transactionType
                )
            }
        }
    }

    fun deleteCategory(category: Category) {
        viewModelScope.launch {
            repository.deleteCategory(category)
        }
    }

    fun moveCategory(category: Category, moveUp: Boolean) {
        viewModelScope.launch {
            val sorted = repository.allCategories.first()
                .filter { it.transactionType == category.transactionType }
                .sortedBy { it.sortOrder }
            val index = sorted.indexOfFirst { it.id == category.id }
            if (index < 0) return@launch
            val targetIndex = if (moveUp) index - 1 else index + 1
            if (targetIndex !in sorted.indices) return@launch
            val current = sorted[index]
            val swap = sorted[targetIndex]
            repository.updateCategory(current.copy(sortOrder = swap.sortOrder))
            repository.updateCategory(swap.copy(sortOrder = current.sortOrder))
        }
    }

    suspend fun countLinkedExpenses(categoryId: Long): Int =
        repository.countExpensesForCategory(categoryId)
}
