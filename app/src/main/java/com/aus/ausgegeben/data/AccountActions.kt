package com.aus.ausgegeben.data

/** Narrow account-lifecycle surface used by Settings' delete-account flow (easy to fake in unit tests). */
interface AccountActions {
    /** True when wipe finished but Auth delete failed — blocks re-seeding empty accounts. */
    suspend fun isAccountDeletionPending(): Boolean

    /** Mark wipe-in-progress before [deleteAllUserData] so a failed Auth delete cannot look like a fresh account. */
    suspend fun markAccountDeletionPending(): Result<Unit>

    /**
     * Drop the marker, agreeing to keep a half-deleted account instead of finishing.
     * Without this the only exit from a failed Auth delete is a successful retry, and
     * an account whose wipe succeeded is unusable in the meantime — [AppRepository.ensureSeeded]
     * refuses to seed while the marker is set, so there are no categories and nothing
     * can be recorded. The cloud data is already gone either way; this only stops
     * treating the account as mid-deletion.
     */
    suspend fun clearAccountDeletionPending(): Result<Unit>

    /** Wipe all cloud docs for the signed-in user. Keeps the accountDeletion marker. */
    suspend fun deleteAllUserData(): Result<Unit>

    /** Seed starter categories after keeping a half-deleted account (no-op while the marker is set). */
    suspend fun ensureSeeded()

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
    suspend fun clearAccountLocalState()
}
