package com.aus.ausgegeben.ui

import android.app.Application
import android.util.Log
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
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class AddExpenseViewModel @Inject constructor(
    application: Application,
    private val repository: AppRepository,
    private val preferenceManager: PreferenceManager,
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "AddExpenseViewModel"
    }

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

    /**
     * Identifies one compose session, so a retried save collapses onto a single
     * transaction rather than creating a second (web parity).
     *
     * Minted per form rather than per attempt: a failed save keeps the same key, so
     * pressing save again cannot duplicate the row. resetForm() rotates it once the
     * save lands, which is what makes the *next* transaction a genuinely new one.
     */
    private var composeIdempotencyKey: String = UUID.randomUUID().toString()

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
        _note.value = expense.note
        _dateMillis.value = expense.dateMillis
        _selectedCategory.value = categories.find { it.id == expense.categoryId }
        _loadedTransactionType.value = TransactionType.fromKey(expense.transactionType)
        viewModelScope.launch {
            val currency = preferenceManager.currencyFlow.first()
            _amount.value = CurrencyUtils.formatAmountForInput(expense.amount, currency)
        }
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
                    // After write, month sum already includes the saved doc — exclude its id
                    // before adding newAmount (web parity). On insert, editingId is null so we
                    // must use the id returned by insertExpense.
                    val excludeIdForBudget: String
                    val saveError: Throwable?
                    if (editingId != null) {
                        val result = repository.updateExpense(expense)
                        excludeIdForBudget = editingId
                        saveError = result.exceptionOrNull()
                    } else {
                        val result = repository.insertExpense(expense, composeIdempotencyKey)
                        excludeIdForBudget = result.getOrNull().orEmpty()
                        saveError = result.exceptionOrNull()
                    }

                    if (saveError == null) {
                        // Budget projection is best-effort — must not look like a failed save
                        // after the write already succeeded (web parity).
                        runCatching { checkBudgetAlert(type, amt, excludeIdForBudget) }
                            .onSuccess { alert -> alert?.let { onBudgetAlert?.invoke(it) } }
                            .onFailure { e -> Log.w(TAG, "budget check failed", e) }
                        resetForm()
                        onSuccess()
                    } else {
                        onError(saveErrorMessage(app, saveError.message))
                    }
                } catch (e: Exception) {
                    onError(saveErrorMessage(app, e.message))
                } finally {
                    _isSaving.value = false
                }
            }
        }
    }

    private fun saveErrorMessage(app: Application, message: String?): String = when (message) {
        "EMAIL_NOT_VERIFIED" -> app.getString(R.string.auth_verify_required)
        "EXPENSE_NOT_FOUND" -> app.getString(R.string.snackbar_transaction_not_found)
        else -> app.getString(R.string.auth_error_generic)
    }

    private suspend fun checkBudgetAlert(
        type: TransactionType,
        newAmount: Double,
        excludeExpenseId: String,
    ): String? {
        if (type != TransactionType.EXPENSE) return null
        val budget = preferenceManager.monthlyBudgetFlow.first() ?: return null
        val spent = repository.sumMonthExpenses(excludeExpenseId)
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
        // A cleared form is a new transaction, so it needs a key of its own —
        // otherwise the next save would dedupe against the one just written.
        composeIdempotencyKey = UUID.randomUUID().toString()
    }
}
