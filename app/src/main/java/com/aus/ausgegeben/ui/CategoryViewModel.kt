package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.entity.Category
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import com.aus.ausgegeben.util.normalizeArgbInt
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class CategoryViewModel @Inject constructor(
    application: Application,
    private val repository: AppRepository,
) : AndroidViewModel(application) {

    val categories: StateFlow<List<Category>> = repository.allCategories
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun clearError() {
        _errorMessage.value = null
    }

    fun addCategory(
        name: String,
        iconName: String,
        colorInt: Int,
        transactionType: String,
        onAdded: ((Category) -> Unit)? = null
    ) {
        viewModelScope.launch {
            try {
                val sameType = repository.allCategories.first()
                    .filter { it.transactionType == transactionType }
                val nextOrder = (sameType.maxOfOrNull { it.sortOrder } ?: -1) + 1
                val idResult = repository.insertCategory(
                    Category(
                        name = name,
                        iconName = iconName,
                        colorInt = normalizeArgbInt(colorInt),
                        transactionType = transactionType,
                        sortOrder = nextOrder
                    )
                )
                idResult.onSuccess { id ->
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
                }.onFailure { e ->
                    _errorMessage.value = e.localizedMessage
                        ?: getApplication<Application>().getString(R.string.category_error_add_failed)
                }
            } catch (e: Exception) {
                _errorMessage.value = e.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_add_failed)
            }
        }
    }

    fun updateCategory(category: Category) {
        viewModelScope.launch {
            val existing = repository.allCategories.first().find { it.id == category.id }
            val normalized = category.copy(colorInt = normalizeArgbInt(category.colorInt))
            repository.updateCategory(normalized).onSuccess {
                if (existing != null && existing.transactionType != normalized.transactionType) {
                    repository.updateExpenseTypesForCategory(
                        normalized.id,
                        normalized.transactionType
                    ).onFailure { e ->
                        _errorMessage.value = e.localizedMessage
                            ?: getApplication<Application>().getString(R.string.category_error_update_failed)
                    }
                }
            }.onFailure { e ->
                _errorMessage.value = e.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_update_failed)
            }
        }
    }

    fun deleteCategory(category: Category) {
        viewModelScope.launch {
            repository.deleteCategory(category).onFailure { e ->
                _errorMessage.value = e.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_delete_failed)
            }
        }
    }

    fun deduplicateCategories() {
        viewModelScope.launch {
            repository.deduplicateCategories().onFailure { e ->
                _errorMessage.value = e.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_deduplicate_failed)
            }
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
            val first = repository.updateCategory(current.copy(sortOrder = swap.sortOrder))
            if (first.isFailure) {
                _errorMessage.value = first.exceptionOrNull()?.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_reorder_failed)
                return@launch
            }
            repository.updateCategory(swap.copy(sortOrder = current.sortOrder)).onFailure { e ->
                _errorMessage.value = e.localizedMessage
                    ?: getApplication<Application>().getString(R.string.category_error_reorder_failed)
            }
        }
    }

    suspend fun countLinkedExpenses(categoryId: String): Int =
        repository.countExpensesForCategory(categoryId)
}
