package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.AccountActions
import com.aus.ausgegeben.data.auth.AccountDeletionAuth
import com.aus.ausgegeben.data.auth.AuthRepository
import com.google.firebase.auth.FirebaseAuthRecentLoginRequiredException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class AccountDeletionUiState(
    val pending: Boolean = false,
    val deleting: Boolean = false,
    val clearing: Boolean = false,
) {
    val busy: Boolean get() = deleting || clearing
}

enum class AccountDeletionToast {
    KEPT,
    KEEP_FAILED,
    DELETED_OK,
    INCOMPLETE,
    FAILED,
    TOO_MANY,
    NEEDS_REAUTH,
}

sealed class DeleteAccountOutcome {
    data object Success : DeleteAccountOutcome()
    data object WrongPassword : DeleteAccountOutcome()
    data class Closed(val toast: AccountDeletionToast) : DeleteAccountOutcome()
}

/**
 * Account-deletion lifecycle extracted from Settings so the irreversible sequence
 * (reauth → mark → wipe → Auth delete) and the keep-account recovery can be unit-tested.
 */
class AccountDeletionCoordinator(
    private val account: AccountActions,
    private val auth: AccountDeletionAuth,
) {
    private val _state = MutableStateFlow(AccountDeletionUiState())
    val state: StateFlow<AccountDeletionUiState> = _state.asStateFlow()

    suspend fun refresh(signedIn: Boolean) {
        val pending = signedIn && account.isAccountDeletionPending()
        _state.update { it.copy(pending = pending) }
    }

    suspend fun keepAccount(): AccountDeletionToast {
        _state.update { it.copy(clearing = true) }
        val cleared = account.clearAccountDeletionPending()
        if (cleared.isFailure) {
            _state.update { it.copy(clearing = false) }
            return AccountDeletionToast.KEEP_FAILED
        }
        _state.update { it.copy(pending = false) }
        runCatching { account.ensureSeeded() }
        _state.update { it.copy(clearing = false) }
        return AccountDeletionToast.KEPT
    }

    suspend fun deleteAccount(password: String): DeleteAccountOutcome {
        _state.update { it.copy(deleting = true) }
        val reauth = auth.reauthenticate(password)
        if (reauth.isFailure) {
            _state.update { it.copy(deleting = false) }
            return when (reauth.exceptionOrNull()?.message) {
                AuthRepository.WRONG_PASSWORD -> DeleteAccountOutcome.WrongPassword
                AuthRepository.TOO_MANY_ATTEMPTS ->
                    DeleteAccountOutcome.Closed(AccountDeletionToast.TOO_MANY)
                else -> DeleteAccountOutcome.Closed(AccountDeletionToast.FAILED)
            }
        }
        val wipe = run {
            val marked = account.markAccountDeletionPending()
            if (marked.isFailure) marked else account.deleteAllUserData()
        }
        val deleted = if (wipe.isSuccess) auth.deleteAccount() else wipe
        if (deleted.isSuccess) {
            // The cloud copy is gone; drop the local one too. Sign-out has always done
            // this, so without it deletion was the *less* thorough of the two and left
            // cached transactions and every preference on the device.
            account.clearAccountLocalState()
        }
        _state.update { it.copy(deleting = false) }
        return deleted.fold(
            onSuccess = { DeleteAccountOutcome.Success },
            onFailure = { error ->
                if (wipe.isSuccess) _state.update { it.copy(pending = true) }
                val toast = when {
                    wipe.isSuccess -> AccountDeletionToast.INCOMPLETE
                    error is FirebaseAuthRecentLoginRequiredException ->
                        AccountDeletionToast.NEEDS_REAUTH
                    else -> AccountDeletionToast.FAILED
                }
                DeleteAccountOutcome.Closed(toast)
            },
        )
    }
}
