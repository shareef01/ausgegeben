package com.aus.ausgegeben.data

import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Narrow preferences surface used by the transaction/insights ViewModels (easy to fake
 * in unit tests). PreferenceManager itself is backed by real DataStore file I/O, which
 * runs on its own real dispatcher — a test's StandardTestDispatcher has no way to fast
 * forward through that, so a ViewModel depending on the concrete class directly hangs
 * forever on the first advanceUntilIdle() instead of failing fast.
 */
interface TransactionPreferences {
    val currencyFlow: Flow<String>
    val monthlyBudgetFlow: Flow<Double?>
    val analyticsPeriodFlow: Flow<String>
    suspend fun updateAnalyticsPeriodKey(storageKey: String)

    /**
     * Mint and durably persist a fresh operation id for one explicit user submission.
     * Never derived from the expense's field values, so two distinct Save taps always
     * get two distinct ids even given byte-identical fields — see DATA-1. Default keeps
     * narrow test fakes source-compatible.
     */
    suspend fun beginExpenseSubmission(): String = UUID.randomUUID().toString()

    /** Forget a submission's bookkeeping once its outcome is known. */
    suspend fun completeExpenseSubmission(operationId: String) = Unit

    /**
     * Resolve a pending entry left behind by a process death between a Firestore write
     * acknowledging and [completeExpenseSubmission] running. Never attempts a write of
     * its own — see [PreferenceManager.reconcilePendingExpenseSubmissions].
     */
    suspend fun reconcilePendingExpenseSubmissions(exists: suspend (String) -> Boolean) = Unit
}
