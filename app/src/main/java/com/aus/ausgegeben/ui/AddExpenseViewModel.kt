package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.datePickerMillisToLocalDayStart
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AddExpenseViewModel(
    application: Application,
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager
) : AndroidViewModel(application) {

    private val _amount = MutableStateFlow("0")
    val amount = _amount.asStateFlow()

    private val _note = MutableStateFlow("")
    val note = _note.asStateFlow()

    private val _selectedCategory = MutableStateFlow<Category?>(null)
    val selectedCategory = _selectedCategory.asStateFlow()

    private val _dateMillis = MutableStateFlow(System.currentTimeMillis())
    val dateMillis = _dateMillis.asStateFlow()

    private val _editingExpenseId = MutableStateFlow<String?>(null)
    val editingExpenseId = _editingExpenseId.asStateFlow()

    private val _loadedTransactionType = MutableStateFlow(TransactionType.EXPENSE)
    val loadedTransactionType = _loadedTransactionType.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving = _isSaving.asStateFlow()

    val categories: StateFlow<List<Category>> = repository.allCategories
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val isEditing: Boolean get() = _editingExpenseId.value != null

    fun onAmountChange(newAmount: String) {
        _amount.value = newAmount
    }

    fun onNoteChange(newNote: String) {
        _note.value = newNote
    }

    fun onCategorySelect(category: Category) {
        _selectedCategory.value = category
    }

    fun clearCategorySelection() {
        _selectedCategory.value = null
    }

    fun onDateChange(millis: Long) {
        val dayStart = datePickerMillisToLocalDayStart(millis)
        val now = java.util.Calendar.getInstance()
        val timeOfDayMillis =
            now.get(java.util.Calendar.HOUR_OF_DAY) * 3_600_000L +
                now.get(java.util.Calendar.MINUTE) * 60_000L +
                now.get(java.util.Calendar.SECOND) * 1_000L
        _dateMillis.value = dayStart + timeOfDayMillis
    }

    fun loadForEdit(expense: Expense, categories: List<Category>) {
        _editingExpenseId.value = expense.id
        _amount.value = CurrencyUtils.formatAmountForInput(expense.amount)
        _note.value = expense.note
        _dateMillis.value = expense.dateMillis
        _selectedCategory.value = categories.find { it.id == expense.categoryId }
        _loadedTransactionType.value = TransactionType.fromKey(expense.transactionType)
    }

    fun saveExpense(
        type: TransactionType,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
        onBudgetAlert: ((String) -> Unit)? = null
    ) {
        if (_isSaving.value) return // SECURE: Idempotency check

        val category = _selectedCategory.value
        val app = getApplication<Application>()
        when {
            category == null -> onError(app.getString(R.string.error_select_category))
            category.transactionType != type.storageKey -> onError(
                app.getString(
                    R.string.error_category_type_mismatch,
                    TransactionType.fromKey(category.transactionType).localizedLabel(app)
                )
            )
            else -> viewModelScope.launch {
                try {
                    _isSaving.value = true
                    val currency = preferenceManager.currencyFlow.first()
                    val amt = CurrencyUtils.parseAmount(_amount.value, currency) ?: 0.0
                    if (amt <= 0) {
                        onError(app.getString(R.string.error_amount_required))
                        return@launch
                    }
                    val editingId = _editingExpenseId.value
                    val expense = Expense(
                        id = editingId ?: "",
                        amount = kotlin.math.abs(amt),
                        dateMillis = _dateMillis.value,
                        categoryId = category.id,
                        note = _note.value.trim(),
                        transactionType = type.storageKey
                    )
                    if (editingId != null) {
                        repository.updateExpense(expense)
                    } else {
                        repository.insertExpense(expense)
                    }
                    checkBudgetAlert(type, amt, editingId)?.let { onBudgetAlert?.invoke(it) }
                    resetForm()
                    onSuccess()
                } catch (e: Exception) {
                    onError(e.localizedMessage ?: app.getString(R.string.auth_error_generic))
                } finally {
                    _isSaving.value = false
                }
            }
        }
    }

    private suspend fun checkBudgetAlert(
        type: TransactionType,
        newAmount: Double,
        editingId: String?
    ): String? {
        if (type != TransactionType.EXPENSE) return null
        val budget = preferenceManager.monthlyBudgetFlow.first() ?: return null
        val spent = repository.sumMonthExpenses(editingId ?: "")
        val projected = spent + newAmount
        if (projected <= budget) return null
        val currency = preferenceManager.currencyFlow.first()
        val app = getApplication<Application>()
        return app.getString(
            R.string.error_budget_exceeded,
            CurrencyUtils.formatAmount(projected, currency),
            CurrencyUtils.formatAmount(budget, currency)
        )
    }

    fun resetForm() {
        _editingExpenseId.value = null
        _amount.value = "0"
        _note.value = ""
        _selectedCategory.value = null
        _dateMillis.value = System.currentTimeMillis()
        _loadedTransactionType.value = TransactionType.EXPENSE
    }
}
