package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.CategoryActions
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
    private val repository: CategoryActions,
) : AndroidViewModel(application) {

    val categories: StateFlow<List<Category>> = repository.allCategories
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _isReordering = MutableStateFlow(false)
    val isReordering: StateFlow<Boolean> = _isReordering.asStateFlow()

    fun clearError() {
        _errorMessage.value = null
    }

    /**
     * Repository failures carry internal sentinels ("EMAIL_NOT_VERIFIED") or raw Firebase
     * text ("PERMISSION_DENIED: Missing or insufficient permissions."). Both were being
     * shown to users verbatim and untranslated; map them like AddExpenseViewModel does.
     */
    private fun errorText(error: Throwable, fallbackResId: Int): String {
        val app = getApplication<Application>()
        return when (error.message) {
            "EMAIL_NOT_VERIFIED" -> app.getString(R.string.auth_verify_required)
            else -> app.getString(fallbackResId)
        }
    }

    fun addCategory(
        name: String,
        iconName: String,
        colorInt: Int,
        transactionType: String,
        onAdded: ((Category) -> Unit)? = null
    ) {
        val sanitized = com.aus.ausgegeben.util.CategoryValidator.sanitize(name)
        if (!com.aus.ausgegeben.util.CategoryValidator.isValid(sanitized)) {
            _errorMessage.value = getApplication<Application>().getString(R.string.category_error_add_failed)
            return
        }
        viewModelScope.launch {
            try {
                val sameType = repository.allCategories.first()
                    .filter { it.transactionType == transactionType }
                val nextOrder = (sameType.maxOfOrNull { it.sortOrder } ?: -1) + 1
                val idResult = repository.insertCategory(
                    Category(
                        name = sanitized,
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
                            name = sanitized,
                            iconName = iconName,
                            colorInt = normalizeArgbInt(colorInt),
                            transactionType = transactionType,
                            sortOrder = nextOrder
                        )
                    )
                }.onFailure { e ->
                    _errorMessage.value = errorText(e, R.string.category_error_add_failed)
                }
            } catch (e: Exception) {
                _errorMessage.value = errorText(e, R.string.category_error_add_failed)
            }
        }
    }

    fun updateCategory(category: Category) {
        val sanitized = com.aus.ausgegeben.util.CategoryValidator.sanitize(category.name)
        if (!com.aus.ausgegeben.util.CategoryValidator.isValid(sanitized)) {
            _errorMessage.value = getApplication<Application>().getString(R.string.category_error_update_failed)
            return
        }
        viewModelScope.launch {
            val existing = repository.allCategories.first().find { it.id == category.id }
            val normalized = category.copy(
                name = sanitized,
                colorInt = normalizeArgbInt(category.colorInt)
            )
            repository.updateCategory(normalized).onSuccess {
                if (existing != null && existing.transactionType != normalized.transactionType) {
                    repository.updateExpenseTypesForCategory(
                        normalized.id,
                        normalized.transactionType
                    ).onFailure { e ->
                        _errorMessage.value = errorText(e, R.string.category_error_update_failed)
                    }
                }
            }.onFailure { e ->
                _errorMessage.value = errorText(e, R.string.category_error_update_failed)
            }
        }
    }

    fun deleteCategory(category: Category) {
        viewModelScope.launch {
            repository.deleteCategory(category).onFailure { e ->
                _errorMessage.value = errorText(e, R.string.category_error_delete_failed)
            }
        }
    }

    fun deduplicateCategories() {
        viewModelScope.launch {
            repository.deduplicateCategories().onFailure { e ->
                _errorMessage.value = errorText(e, R.string.category_error_deduplicate_failed)
            }
        }
    }

    /**
     * Two rapid taps used to race: each read the category list fresh and wrote
     * sequentially, so a second tap could compute its move from data the first
     * tap's writes hadn't landed in yet, reintroducing duplicate sortOrder values
     * through overlapping writes. The guard serializes moves.
     *
     * The read stays `repository.allCategories.first()`, not the cached
     * [categories] StateFlow: [categories] is only kept warm while something
     * collects it (`WhileSubscribed`), which happens on the Settings > Categories
     * screen but *not* in the manage-categories sheet opened from Add Transaction
     * (that screen displays a different ViewModel's category list and only calls
     * through to `moveCategory`). Reading the cached value there silently computed
     * against a stale-or-empty list and moved nothing.
     *
     * The writes go through updateCategoriesBatch, not one updateCategory call per
     * changed row: a reorder touches every category in the type, and writing them
     * one at a time left a window where a failure partway through — the exact
     * PERMISSION_DENIED bug this method has already hit twice — left some rows
     * renumbered and others not, a worse state than either order.
     */
    fun moveCategory(category: Category, moveUp: Boolean) {
        if (_isReordering.value) return
        _isReordering.value = true
        viewModelScope.launch {
            try {
                val changed = categoriesAfterMove(repository.allCategories.first(), category, moveUp)
                repository.updateCategoriesBatch(changed).onFailure { e ->
                    _errorMessage.value = errorText(e, R.string.category_error_reorder_failed)
                }
            } finally {
                _isReordering.value = false
            }
        }
    }

    suspend fun countLinkedExpenses(categoryId: String): Int =
        repository.countExpensesForCategory(categoryId)
}

/**
 * The categories whose sortOrder must change to move [category] one place within
 * its own type. Empty when the move is impossible (already at the end, or the
 * category is not in the list).
 *
 * Pure, and separated from the ViewModel because two bugs lived in exactly this
 * logic and neither was reachable by a test while it was inline:
 *
 *  - It ranked against a list that *included* the Uncategorized sentinel, while
 *    CategoryScreen hides it. The sentinel sits at sortOrder 999, so any category
 *    on the far side of it swapped with a row the user cannot see, and the screen
 *    did not visibly change. The filter now matches the screen's exactly.
 *  - It swapped the two sortOrder values, which is a no-op whenever a pair shares
 *    one. Real data had two categories at 1000. Renumbering the whole type
 *    sequentially is correct regardless of duplicates or gaps, and normalises them
 *    away as a side effect.
 *
 * Ties break by id so this and CategoryScreen agree; a plain sortedBy leaves equal
 * keys in source order, which the two could resolve differently — and then "move
 * up" moves a different row than the one the user pointed at.
 */
internal fun categoriesAfterMove(
    all: List<Category>,
    category: Category,
    moveUp: Boolean,
): List<Category> {
    val ordered = all
        .filter {
            it.transactionType == category.transactionType &&
                it.id != AppRepository.UNCATEGORIZED_ID
        }
        .sortedWith(compareBy({ it.sortOrder }, { it.id }))
        .toMutableList()

    val index = ordered.indexOfFirst { it.id == category.id }
    if (index < 0) return emptyList()
    val targetIndex = if (moveUp) index - 1 else index + 1
    if (targetIndex !in ordered.indices) return emptyList()

    java.util.Collections.swap(ordered, index, targetIndex)

    return ordered.mapIndexedNotNull { position, item ->
        if (item.sortOrder == position) null else item.copy(sortOrder = position)
    }
}
