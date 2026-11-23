package com.aus.ausgegeben.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.CategoryActions
import com.aus.ausgegeben.data.ExpenseActions
import com.aus.ausgegeben.data.TransactionPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.datePickerMillisToLocalDayStart
import com.aus.ausgegeben.util.runSuspendCatching
import com.aus.ausgegeben.util.withLocalTimeOfDay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
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
    private val savedStateHandle: SavedStateHandle,
) : AndroidViewModel(application) {

    /**
     * Test/legacy constructor: no process-death persistence. Production always uses the
     * Hilt constructor above, which receives the Activity's SavedStateHandle.
     */
    constructor(
        application: Application,
        categoryActions: CategoryActions,
        expenseActions: ExpenseActions,
        preferenceManager: TransactionPreferences,
    ) : this(application, categoryActions, expenseActions, preferenceManager, SavedStateHandle())

    companion object {
        private const val TAG = "AddExpenseViewModel"

        // Saved draft version. Bump when a field's meaning changes; older payloads are
        // ignored rather than reinterpreted.
        private const val DRAFT_VERSION = 1
        private const val KEY_VERSION = "draft.version"
        private const val KEY_OWNER = "draft.ownerUid"
        private const val KEY_AMOUNT = "draft.amount"
        private const val KEY_NOTE = "draft.note"
        private const val KEY_CATEGORY_ID = "draft.categoryId"
        private const val KEY_DATE = "draft.dateMillis"
        private const val KEY_EDITING_ID = "draft.editingExpenseId"
        private const val KEY_EDITING_OWNER = "draft.editingOwnerUid"
        private const val KEY_DRAFT_TYPE = "draft.transactionType"
        private const val KEY_LOADED_TYPE = "draft.loadedType"
        private const val KEY_BASE_AMOUNT = "draft.baseline.amount"
        private const val KEY_BASE_NOTE = "draft.baseline.note"
        private const val KEY_BASE_CATEGORY = "draft.baseline.categoryId"
        private const val KEY_BASE_DATE = "draft.baseline.dateMillis"
        private const val KEY_BASE_TYPE = "draft.baseline.transactionType"
        private const val KEY_ORIGINAL_AMOUNT = "draft.original.amount"
        private const val KEY_ORIGINAL_NOTE = "draft.original.note"
        private const val KEY_ORIGINAL_CATEGORY = "draft.original.categoryId"
        private const val KEY_ORIGINAL_DATE = "draft.original.dateMillis"
        private const val KEY_ORIGINAL_TYPE = "draft.original.transactionType"
        private const val MIN_VALID_MILLIS = 946_684_800_000L // 2000-01-01 UTC
        private const val MAX_VALID_MILLIS = 4_102_444_800_000L // 2100-01-01 UTC
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
     * The type currently selected in the editor. Owned by the view model (rather than the
     * screen's `remember`) so a restored draft keeps the tab the user was on.
     */
    private val _draftType = MutableStateFlow(TransactionType.EXPENSE)
    val draftType = _draftType.asStateFlow()

    /** Account whose draft is in this (activity-scoped) editor; guards cross-account restore. */
    private var draftOwnerUid: String? = null
    /** Resolves a restored category id once the category list arrives; cancelled on reset. */
    private var categoryResolveJob: Job? = null

    private val _isSaving = MutableStateFlow(false)
    val isSaving = _isSaving.asStateFlow()

    /**
     * True while an edit's original values are still being loaded.
     *
     * The form cannot be treated as ready before the amount (loaded asynchronously with
     * the currency) and the dirty baseline exist: rendering the editable form earlier
     * let a keystroke be overwritten when the loaded amount arrived, and made "close"
     * ambiguous because there was no baseline yet. While this is true the screen shows a
     * spinner and closing cannot lose anything, because nothing can be typed.
     */
    private val _isDraftLoading = MutableStateFlow(false)
    val isDraftLoading = _isDraftLoading.asStateFlow()

    val categories: StateFlow<List<Category>> = categoryActions.allCategories
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    init {
        // Restore before the persistence collector starts, so it writes the restored form
        // (and the restored baseline), not a blank one.
        restoreDraft()
        viewModelScope.launch {
            combine(
                combine(_amount, _note, _selectedCategory) { amountText, note, category ->
                    Triple(amountText, note, category)
                },
                _dateMillis,
                _editingExpenseId,
                _draftType,
                _isDraftLoading,
            ) { _, _, _, _, loading -> loading }
                .collect { loading ->
                    // Do not persist the half-populated form while an edit is loading.
                    if (!loading) persistDraft()
                }
        }
    }

    val isEditing: Boolean get() = _editingExpenseId.value != null

    /** The form's current values, with [type] supplied by the screen's tab state. */
    private fun currentSnapshot(type: TransactionType) = TransactionDraftSnapshot(
        amountText = _amount.value,
        transactionType = type,
        categoryId = _selectedCategory.value?.id,
        note = _note.value,
        dateMillis = _dateMillis.value,
    )

    /**
     * Values the form opened with — blank for a new transaction, otherwise the loaded
     * expense. Null only while an edit is loading, which reads as "not dirty".
     *
     * Starts as the blank draft rather than null: a view model created without
     * resetForm() (e.g. the form restored after process death) must still guard what
     * the user types, and null would have reported every draft as clean.
     */
    private var baseline: TransactionDraftSnapshot? = currentSnapshot(TransactionType.EXPENSE)

    /** The in-flight [loadForEdit] amount load; cancelled when the form is reset or reloaded. */
    private var editLoadJob: Job? = null
    /** The stored transaction this editor loaded; an edit writes only what changed from it (AUS-104). */
    private var editingOriginal: Expense? = null

    /**
     * Whether closing the form now would discard user input.
     *
     * [currentType] is the editor's selected type (view model [draftType]); works for
     * edits too because the baseline is the loaded transaction, not an empty draft.
     */
    fun hasUnsavedChanges(currentType: TransactionType): Boolean =
        isTransactionDraftDirty(
            baseline = baseline,
            current = currentSnapshot(currentType),
        )

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
        // Set before touching any field: the draft-persistence collector must not write a
        // half-populated edit (new id, old amount) if it runs between these assignments.
        _isDraftLoading.value = true
        categoryResolveJob?.cancel()
        categoryResolveJob = null
        _editingExpenseId.value = expense.id
        editingOriginal = expense
        _editingOwnerUid.value = ownerUid
        _note.value = expense.note
        _dateMillis.value = expense.dateMillis
        _selectedCategory.value = categories.find { it.id == expense.categoryId }
        _loadedTransactionType.value = TransactionType.fromKey(expense.transactionType)
        _draftType.value = _loadedTransactionType.value
        // No baseline until the amount is loaded: reporting "dirty" while the form is
        // still populating would prompt the user to discard a transaction they have not
        // touched yet.
        baseline = null
        // A previous load that has not run yet would otherwise finish into this form with
        // the other transaction's amount.
        editLoadJob?.cancel()
        editLoadJob = viewModelScope.launch {
            // In the app language's decimal format, like every amount on screen. This used
            // to wait for the currency setting, which no longer decides the format.
            _amount.value = CurrencyUtils.formatAmountForInput(expense.amount)
            baseline = currentSnapshot(_loadedTransactionType.value)
            _isDraftLoading.value = false
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
                    val amt = CurrencyUtils.parseAmount(_amount.value) ?: 0.0
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
                        val result = expenseActions.updateExpense(expense, editingOriginal)
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
        categoryResolveJob?.cancel()
        categoryResolveJob = null
        clearSavedDraft()
        _editingExpenseId.value = null
        editingOriginal = null
        _editingOwnerUid.value = null
        _amount.value = "0"
        _note.value = ""
        _selectedCategory.value = null
        _dateMillis.value = System.currentTimeMillis()
        _loadedTransactionType.value = TransactionType.EXPENSE
        _draftType.value = TransactionType.EXPENSE
        editLoadJob?.cancel()
        editLoadJob = null
        _isDraftLoading.value = false
        baseline = currentSnapshot(_loadedTransactionType.value)
    }

    /** The editor's type tab; persisted so a restored draft keeps the selected type. */
    fun setDraftType(type: TransactionType) {
        if (_draftType.value != type) _draftType.value = type
    }

    /**
     * Bind the activity-scoped editor to the signed-in account.
     *
     * A restored draft is kept only when it belongs to this account. A switch (or a
     * sign-out) resets the form and clears the saved draft, so one account's amount,
     * note or category can never reappear for another.
     *
     * @return true when a draft from another account was discarded.
     */
    fun bindOwner(uid: String?): Boolean {
        val previous = draftOwnerUid
        val reset = previous != null && previous != uid
        if (reset) resetForm()
        draftOwnerUid = uid
        return reset
    }

    /** Restore a draft saved before configuration/process death, if it is valid. */
    private fun restoreDraft() {
        if (savedStateHandle.get<Int>(KEY_VERSION) != DRAFT_VERSION) return
        draftOwnerUid = savedStateHandle.get<String>(KEY_OWNER)
        _amount.value = savedStateHandle.get<String>(KEY_AMOUNT)
            ?.take(40)
            ?.takeIf { it.isNotBlank() }
            ?: "0"
        _note.value = savedStateHandle.get<String>(KEY_NOTE)?.take(2000) ?: ""
        _dateMillis.value = savedStateHandle.get<Long>(KEY_DATE)
            ?.takeIf { it in MIN_VALID_MILLIS until MAX_VALID_MILLIS }
            ?: System.currentTimeMillis()
        _editingExpenseId.value = savedStateHandle.get<String>(KEY_EDITING_ID)
            ?.takeIf { it.isNotBlank() && it.length <= 64 }
        _editingOwnerUid.value = savedStateHandle.get<String>(KEY_EDITING_OWNER)
            ?.takeIf { it.isNotBlank() && it.length <= 128 }
        _loadedTransactionType.value = TransactionType.fromKey(
            savedStateHandle.get<String>(KEY_LOADED_TYPE) ?: TransactionType.EXPENSE.storageKey
        )
        _draftType.value = TransactionType.fromKey(
            savedStateHandle.get<String>(KEY_DRAFT_TYPE) ?: TransactionType.EXPENSE.storageKey
        )

        val restoredCategoryId = savedStateHandle.get<String>(KEY_CATEGORY_ID)
            ?.takeIf { it.isNotBlank() && it.length < 64 }
        val baseAmount = savedStateHandle.get<String>(KEY_BASE_AMOUNT)
        baseline = if (baseAmount != null) {
            TransactionDraftSnapshot(
                amountText = baseAmount,
                transactionType = TransactionType.fromKey(
                    savedStateHandle.get<String>(KEY_BASE_TYPE) ?: _draftType.value.storageKey
                ),
                categoryId = savedStateHandle.get<String>(KEY_BASE_CATEGORY)
                    ?.takeIf { it.isNotBlank() && it.length < 64 },
                note = savedStateHandle.get<String>(KEY_BASE_NOTE)?.take(2000) ?: "",
                dateMillis = savedStateHandle.get<Long>(KEY_BASE_DATE)
                    ?.takeIf { it in MIN_VALID_MILLIS until MAX_VALID_MILLIS }
                    ?: _dateMillis.value,
            )
        } else {
            currentSnapshot(_draftType.value)
        }

        val originalAmount = savedStateHandle.get<Double>(KEY_ORIGINAL_AMOUNT)
        val editingId = _editingExpenseId.value
        editingOriginal = if (editingId != null && originalAmount != null) {
            Expense(
                id = editingId,
                amount = originalAmount,
                dateMillis = savedStateHandle.get<Long>(KEY_ORIGINAL_DATE) ?: _dateMillis.value,
                categoryId = savedStateHandle.get<String>(KEY_ORIGINAL_CATEGORY).orEmpty(),
                note = savedStateHandle.get<String>(KEY_ORIGINAL_NOTE)?.take(2000) ?: "",
                transactionType = savedStateHandle.get<String>(KEY_ORIGINAL_TYPE)
                    ?: _draftType.value.storageKey,
            )
        } else {
            null
        }

        _isDraftLoading.value = false
        if (restoredCategoryId != null) resolveRestoredCategory(restoredCategoryId)
    }

    /** Persist the current draft; a pristine new form leaves no state behind. */
    private fun persistDraft() {
        val current = currentSnapshot(_draftType.value)
        val base = baseline
        if (_editingExpenseId.value == null && base != null &&
            !isTransactionDraftDirty(base, current)
        ) {
            clearSavedDraft()
            return
        }

        savedStateHandle[KEY_VERSION] = DRAFT_VERSION
        putString(KEY_OWNER, draftOwnerUid)
        savedStateHandle[KEY_AMOUNT] = _amount.value.take(40)
        savedStateHandle[KEY_NOTE] = _note.value.take(2000)
        putString(KEY_CATEGORY_ID, _selectedCategory.value?.id)
        savedStateHandle[KEY_DATE] = _dateMillis.value
        putString(KEY_EDITING_ID, _editingExpenseId.value)
        putString(KEY_EDITING_OWNER, _editingOwnerUid.value)
        savedStateHandle[KEY_DRAFT_TYPE] = _draftType.value.storageKey
        savedStateHandle[KEY_LOADED_TYPE] = _loadedTransactionType.value.storageKey

        val baseSnapshot = base ?: current
        savedStateHandle[KEY_BASE_AMOUNT] = baseSnapshot.amountText
        savedStateHandle[KEY_BASE_NOTE] = baseSnapshot.note.take(2000)
        putString(KEY_BASE_CATEGORY, baseSnapshot.categoryId)
        savedStateHandle[KEY_BASE_DATE] = baseSnapshot.dateMillis
        savedStateHandle[KEY_BASE_TYPE] = baseSnapshot.transactionType.storageKey

        val original = editingOriginal
        if (original != null) {
            savedStateHandle[KEY_ORIGINAL_AMOUNT] = original.amount
            savedStateHandle[KEY_ORIGINAL_DATE] = original.dateMillis
            savedStateHandle[KEY_ORIGINAL_CATEGORY] = original.categoryId
            savedStateHandle[KEY_ORIGINAL_NOTE] = original.note.take(2000)
            savedStateHandle[KEY_ORIGINAL_TYPE] = original.transactionType
        } else {
            savedStateHandle.remove<Any>(KEY_ORIGINAL_AMOUNT)
            savedStateHandle.remove<Any>(KEY_ORIGINAL_DATE)
            savedStateHandle.remove<Any>(KEY_ORIGINAL_CATEGORY)
            savedStateHandle.remove<Any>(KEY_ORIGINAL_NOTE)
            savedStateHandle.remove<Any>(KEY_ORIGINAL_TYPE)
        }
    }

    private fun putString(key: String, value: String?) {
        if (value == null) savedStateHandle.remove<Any>(key)
        else savedStateHandle[key] = value
    }

    /** Drop every saved draft field; the marker is the version key. */
    private fun clearSavedDraft() {
        savedStateHandle.keys()
            .filter { it.startsWith("draft.") }
            .forEach { savedStateHandle.remove<Any>(it) }
    }

    /**
     * Resolve a restored category id once the category snapshot arrives. The category may
     * have been deleted while the app was gone; leaving the selection empty then is
     * correct — the save path refuses rather than guessing another category.
     */
    private fun resolveRestoredCategory(categoryId: String) {
        categoryResolveJob?.cancel()
        categoryResolveJob = viewModelScope.launch {
            if (_selectedCategory.value != null) return@launch
            val list = categories.first { it.isNotEmpty() }
            if (_selectedCategory.value == null) {
                _selectedCategory.value = list.firstOrNull { it.id == categoryId }
            }
        }
    }
}
