package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import android.util.Log
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.auth.AuthActions
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import javax.inject.Inject

enum class AuthTab {
    SIGN_IN,
    SIGN_UP,
}

data class AuthUiState(
    val selectedTab: AuthTab = AuthTab.SIGN_IN,
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val loadingMessage: String? = null,
    val errorMessage: String? = null,
    val infoMessage: String? = null,
    val passwordVisible: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    application: Application,
    private val authRepository: AuthActions,
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "AuthViewModel"
        private const val AUTH_TIMEOUT_MS = 25_000L
    }

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun onTabSelected(tab: AuthTab) {
        _uiState.update {
            it.copy(
                selectedTab = tab,
                errorMessage = null,
                infoMessage = null,
                confirmPassword = "",
            )
        }
    }

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null, infoMessage = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun onConfirmPasswordChange(value: String) {
        _uiState.update { it.copy(confirmPassword = value, errorMessage = null) }
    }

    fun onTogglePasswordVisibility() {
        _uiState.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    fun submit(onSuccess: () -> Unit) {
        val state = _uiState.value
        val email = state.email.trim()
        val password = state.password

        if (email.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = appString(R.string.auth_error_email_required))
            }
            return
        }
        if (state.selectedTab == AuthTab.SIGN_UP && password.length < 8) {
            _uiState.update {
                it.copy(errorMessage = appString(R.string.auth_error_password_short))
            }
            return
        }
        if (state.selectedTab == AuthTab.SIGN_IN && password.isEmpty()) {
            _uiState.update {
                it.copy(errorMessage = appString(R.string.auth_error_password_short))
            }
            return
        }
        if (state.selectedTab == AuthTab.SIGN_UP && password != state.confirmPassword) {
            _uiState.update {
                it.copy(errorMessage = appString(R.string.auth_error_password_mismatch))
            }
            return
        }

        viewModelScope.launch {
            val loadingMessage = when (state.selectedTab) {
                AuthTab.SIGN_IN -> appString(R.string.auth_loading_sign_in)
                AuthTab.SIGN_UP -> appString(R.string.auth_loading_sign_up)
            }
            _uiState.update {
                it.copy(isLoading = true, loadingMessage = loadingMessage, errorMessage = null, infoMessage = null)
            }
            val result = runCatching {
                withTimeout(AUTH_TIMEOUT_MS) {
                    when (state.selectedTab) {
                        AuthTab.SIGN_IN -> authRepository.signIn(email, password).getOrThrow()
                        AuthTab.SIGN_UP -> authRepository.signUp(email, password).getOrThrow()
                    }
                }
            }
            handleAuthResult(result, onSuccess)
        }
    }

    fun sendPasswordReset() {
        val email = _uiState.value.email.trim()
        if (email.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = appString(R.string.auth_error_email_required))
            }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, infoMessage = null) }
            authRepository.sendPasswordResetEmail(email).fold(
                onSuccess = {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            infoMessage = appString(R.string.auth_reset_email_sent),
                        )
                    }
                },
                onFailure = { _ ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = appString(R.string.auth_error_generic),
                        )
                    }
                },
            )
        }
    }

    fun signOut(onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            authRepository.signOut()
            onComplete()
        }
    }

    private fun appString(resId: Int): String {
        return getApplication<Application>().getString(resId)
    }

    private fun handleAuthResult(result: Result<Unit>, onSuccess: () -> Unit) {
        result.fold(
            onSuccess = {
                _uiState.update { it.copy(isLoading = false, loadingMessage = null) }
                onSuccess()
            },
            onFailure = { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        loadingMessage = null,
                        errorMessage = mapAuthError(error),
                    )
                }
            },
        )
    }

    private fun mapAuthError(error: Throwable): String {
        Log.w(TAG, "Auth failed: ${error.javaClass.simpleName}: ${error.message}", error)
        return when {
            error is TimeoutCancellationException -> appString(R.string.auth_error_timeout)
            error is FirebaseNetworkException -> appString(R.string.auth_error_timeout)
            error is FirebaseTooManyRequestsException -> appString(R.string.auth_error_generic)
            error is FirebaseAuthInvalidCredentialsException -> appString(R.string.auth_error_invalid_credentials)
            error is FirebaseAuthInvalidUserException -> appString(R.string.auth_error_user_not_found)
            error is FirebaseAuthUserCollisionException -> appString(R.string.auth_error_email_in_use)
            error is FirebaseAuthWeakPasswordException -> appString(R.string.auth_error_weak_password)
            error is FirebaseAuthException ->
                error.message?.takeIf { it.isNotBlank() } ?: appString(R.string.auth_error_generic)
            else ->
                error.message?.takeIf { it.isNotBlank() } ?: appString(R.string.auth_error_generic)
        }
    }
}
