package com.aus.ausgegeben.data

/** Narrow account-lifecycle surface used by Settings' delete-account flow (easy to fake in unit tests). */
interface AccountActions {
    /** True when the permanent deletion tombstone has frozen the account. */
    suspend fun isAccountDeletionPending(): Boolean

    suspend fun markAccountDeletionPending(): Result<Unit>

    suspend fun deleteAllUserData(): Result<Unit>

    /**
     * Drop account-scoped local state: DataStore prefs and the Firestore offline cache.
     *
     * [AuthRepository.signOut] has always done this, but the account-deletion success path
     * did not, so deleting an account was *less* thorough than signing out of it — the
     * user's cached transaction history (up to [FirestoreClient.CACHE_SIZE_BYTES]) and
     * every preference survived on the device after they asked for it all to be removed,
     * and the next person to register on that device inherited the budget and reminders.
     * Web has always cleared both (authService.deleteAccount → resetPreferences +
     * clearLocalFirestoreCache); this closes the gap.
     */
    /** Failure means cloud deletion may be complete but local erasure is unconfirmed. */
    suspend fun clearAccountLocalState(): Result<Unit>
}
