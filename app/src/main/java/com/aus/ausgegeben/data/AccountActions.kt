package com.aus.ausgegeben.data

/** Narrow account-lifecycle surface used by Settings' delete-account flow (easy to fake in unit tests). */
interface AccountActions {
    /** True when wipe finished but Auth delete failed — blocks re-seeding empty accounts. */
    suspend fun isAccountDeletionPending(): Boolean

    /** Mark wipe-in-progress before [deleteAllUserData] so a failed Auth delete cannot look like a fresh account. */
    suspend fun markAccountDeletionPending(): Result<Unit>

    /** Wipe all cloud docs for the signed-in user. Keeps the accountDeletion marker. */
    suspend fun deleteAllUserData(): Result<Unit>
}
