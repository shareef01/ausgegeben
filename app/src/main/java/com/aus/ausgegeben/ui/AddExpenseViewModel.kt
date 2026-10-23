package com.aus.ausgegeben.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.TransactionDraft
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.datePickerMillisToLocalDayStart
import com.aus.ausgegeben.util.runSuspendCatching
import com.aus.ausgegeben.util.withLocalTimeOfDay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class AddExpenseViewModel @Inject constructor(
    application: Application,
    private val categoryActions: CategoryActions,
    private val expenseActions: ExpenseActions,
    private val preferenceManager: TransactionPreferences,
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

    private val _editingOwnerUid = MutableStateFlow<String?>(null)
    val editingOwnerUid = _editingOwnerUid.asStateFlow()

    private val _loadedTransactionType = MutableStateFlow(TransactionType.EXPENSE)
    val loadedTransactionType = _loadedTransactionType.asStateFlow()

    /**
     * The draft the editor opened with (UX-1). Null until the fields have been seeded, so an
     * unloaded editor can never be "dirty". Set by `loadForEdit` (once the amount has been
     * formatted for the display currency) and by `resetForm`; read by the screen's close guard.
     */
    private val _baseline = MutableStateFlow<TransactionDraft?>(null)
    val baseline = _baseline.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving = _isSaving.asStateFlow()

    val categories: StateFlow<List<Category>> = categoryActions.allCategories
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
        // Keep the time of day the transaction already has: its original time when
        // editing, the time the form was opened for a new one.
        _dateMillis.value = withLocalTimeOfDay(datePickerMillisToLocalDayStart(millis), _dateMillis.value)
    }

    fun loadForEdit(expense: Expense, categories: List<Category>, ownerUid: String? = null) {
        _editingExpenseId.value = expense.id
        _editingOwnerUid.value = ownerUid
        _note.value = expense.note
        _dateMillis.value = expense.dateMillis
        _selectedCategory.value = categories.find { it.id == expense.categoryId }
        _loadedTransactionType.value = TransactionType.fromKey(expense.transactionType)
        viewModelScope.launch {
            val currency = preferenceManager.currencyFlow.first()
            _amount.value = CurrencyUtils.formatAmountForInput(expense.amount, currency)
            // Captured after the amount is formatted for the display currency, and using the
            // *selected* category id: an orphan/stored-but-unselectable category leaves the
            // selection null, so an untouched edit of such a row is not reported as dirty.
            _baseline.value = TransactionDraft.of(
                amountText = _amount.value,
                currencyCode = currency,
                transactionType = expense.transactionType,
                categoryId = _selectedCategory.value?.id,
                note = _note.value,
                dateMillis = _dateMillis.value,
            )
        }
    }

    fun saveExpense(
        type: TransactionType,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
        onBudgetAlert: ((String) -> Unit)? = null,
        currentUid: String? = null
    ) {
        if (!_isSaving.compareAndSet(expect = false, update = true)) return // SECURE: Idempotency check

        val category = _selectedCategory.value
        val app = getApplication<Application>()
        val boundUid = _editingOwnerUid.value
        if (boundUid != null && currentUid != null && boundUid != currentUid) {
            _isSaving.value = false
            onError(app.getString(R.string.auth_error_generic))
            return
        }

        when {
            category == null -> {
                _isSaving.value = false
                onError(app.getString(R.string.error_select_category))
            }
            category.transactionType != type.storageKey -> {
                _isSaving.value = false
                onError(
                    app.getString(
                        R.string.error_category_type_mismatch,
                        TransactionType.fromKey(category.transactionType).localizedLabel(app)
                    )
                )
            }
            else -> viewModelScope.launch {
                try {
                    val currency = preferenceManager.currencyFlow.first()
                    val amt = CurrencyUtils.parseAmount(_amount.value, currency) ?: 0.0
                    if (amt <= 0) {
                        _isSaving.value = false
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
                        val result = expenseActions.updateExpense(expense)
                        excludeIdForBudget = editingId
                        saveError = result.exceptionOrNull()
                    } else {
                        // A fresh operation id per explicit Save tap — never derived from
                        // the field values — so two genuinely distinct transactions can
                        // never be collapsed into one, even if every field happens to
                        // match (DATA-1). Persisted before Firestore is called so a crash
                        // between the write landing and this journal entry being cleared
                        // is reconciled (not resubmitted) on next sign-in; see
                        // AppRepository.ensureSeeded().
                        val operationId = preferenceManager.beginExpenseSubmission()
                        val result = expenseActions.insertExpense(expense, operationId)
                        excludeIdForBudget = result.getOrNull().orEmpty()
                        saveError = result.exceptionOrNull()
                        if (saveError == null) {
                            runSuspendCatching {
                                preferenceManager.completeExpenseSubmission(operationId)
                            }.onFailure { e ->
                                // The financial write is already acknowledged. Leaving the
                                // journal makes a retry dedupe; it must not become a false save error.
                                Log.w(TAG, "could not clear expense submission journal", e)
                            }
                        }
                    }

                    if (saveError == null) {
                        // Budget projection is best-effort — must not look like a failed save
                        // after the write already succeeded (web parity).
                        runSuspendCatching { checkBudgetAlert(type, amt, expense.dateMillis, excludeIdForBudget) }
                            .onSuccess { alert -> alert?.let { onBudgetAlert?.invoke(it) } }
                            .onFailure { e ->
                                Log.w(TAG, "budget check failed", e)
                                onBudgetAlert?.invoke(app.getString(R.string.error_budget_check_failed))
                            }
                        resetForm()
                        onSuccess()
                    } else {
                        onError(saveErrorMessage(app, saveError.message))
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
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
        dateMillis: Long,
        excludeExpenseId: String,
    ): String? {
        if (type != TransactionType.EXPENSE) return null
        // The monthly budget only covers this month. A transaction dated in another month
        // never adds to this month's spend, so projecting spent + newAmount for it raised a
        // false "budget exceeded" alert for every backdated (or forward-dated) entry.
        val thisMonth = AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: return null
        if (dateMillis !in thisMonth.first until thisMonth.second) return null
        val budget = preferenceManager.monthlyBudgetFlow.first() ?: return null
        val spent = expenseActions.sumMonthExpenses(excludeExpenseId)
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
        _editingOwnerUid.value = null
        _amount.value = "0"
        _note.value = ""
        _selectedCategory.value = null
        _dateMillis.value = System.currentTimeMillis()
        _loadedTransactionType.value = TransactionType.EXPENSE
        // A fresh form's baseline is what it starts as, so an untouched create is not dirty.
        viewModelScope.launch {
            val currency = preferenceManager.currencyFlow.first()
            _baseline.value = TransactionDraft.of(
                amountText = _amount.value,
                currencyCode = currency,
                transactionType = TransactionType.EXPENSE.storageKey,
                categoryId = null,
                note = _note.value,
                dateMillis = _dateMillis.value,
            )
        }
    }
}
