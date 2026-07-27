package com.aus.ausgegeben.data.auth

/** Narrow auth surface used by AuthViewModel (easy to fake in unit tests). */
interface AuthActions {
    suspend fun signIn(email: String, password: String): Result<Unit>
    suspend fun signUp(email: String, password: String): Result<Unit>
    suspend fun sendPasswordResetEmail(email: String): Result<Unit>
    suspend fun signOut()
}
