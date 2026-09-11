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
) {
    val busy: Boolean get() = deleting
}

enum class AccountDeletionToast {
    DELETED_OK,
    LOCAL_DATA_REMAINS,
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
 * (reauth → freeze → verified cloud wipe → Auth delete → local erase)
 * and recovery can be unit-tested.
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
        val marked = account.markAccountDeletionPending()
        if (marked.isFailure) {
            _state.update { it.copy(deleting = false) }
            return DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE)
        }
        _state.update { it.copy(pending = true) }

        // All Firestore operations are server-acknowledged. An interruption leaves the
        // permanent marker in place and a later reauthenticated attempt resumes safely.
        val wiped = account.deleteAllUserData()
        if (wiped.isFailure) {
            _state.update { it.copy(deleting = false) }
            return DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE)
        }
        val deleted = auth.deleteAccount()
        var localCleanupFailed = false
        if (deleted.isSuccess) {
            // The cloud copy is gone; drop the local one too. Sign-out has always done
            // this, so without it deletion was the *less* thorough of the two and left
            // cached transactions and every preference on the device.
            localCleanupFailed = account.clearAccountLocalState().isFailure
        }
        _state.update { it.copy(deleting = false) }
        return deleted.fold(
            onSuccess = {
                _state.update { it.copy(pending = false) }
                if (localCleanupFailed) {
                    DeleteAccountOutcome.Closed(AccountDeletionToast.LOCAL_DATA_REMAINS)
                } else {
                    DeleteAccountOutcome.Success
                }
            },
            onFailure = { error ->
                // A partial client wipe leaves the tombstone in place. Treat it as
                // pending until the next reauthenticated attempt resumes.
                _state.update { it.copy(pending = true) }
                val toast = when {
                    error is FirebaseAuthRecentLoginRequiredException ->
                        AccountDeletionToast.NEEDS_REAUTH
                    else -> AccountDeletionToast.INCOMPLETE
                }
                DeleteAccountOutcome.Closed(toast)
            },
        )
    }
}
