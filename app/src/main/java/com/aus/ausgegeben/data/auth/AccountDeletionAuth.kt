package com.aus.ausgegeben.data.auth

/** Reauth + Auth delete for account removal. Narrower than [AuthRepository] so Settings can be tested. */
interface AccountDeletionAuth {
    suspend fun reauthenticate(password: String): Result<Unit>
    suspend fun deleteAccount(): Result<Unit>
}
