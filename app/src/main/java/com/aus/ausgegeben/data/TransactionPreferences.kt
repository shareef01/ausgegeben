package com.aus.ausgegeben.data

import kotlinx.coroutines.flow.Flow

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
}
