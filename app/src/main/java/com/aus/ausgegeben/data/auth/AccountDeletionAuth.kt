package com.aus.ausgegeben.data.auth

/** Reauthentication and Firebase Auth deletion, isolated for coordinator tests. */
interface AccountDeletionAuth {
    suspend fun reauthenticate(password: String): Result<Unit>
    suspend fun deleteAccount(): Result<Unit>
}
