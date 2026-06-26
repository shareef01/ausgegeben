package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.StorageMode
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.cloud.CloudSyncRepository
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException

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

class AuthViewModel(
    application: Application,
    private val authRepository: AuthRepository,
    private val preferenceManager: PreferenceManager,
    private val cloudSyncRepository: CloudSyncRepository,
) : AndroidViewModel(application) {

    companion object {
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

    fun continueOffline(onSuccess: () -> Unit) {
        viewModelScope.launch {
            preferenceManager.setStorageMode(StorageMode.LOCAL)
            preferenceManager.setAuthGatewayComplete()
            onSuccess()
        }
    }

    fun submit(onSuccess: () -> Unit) {
        val state = _uiState.value
        val email = state.email.trim()
        val password = state.password

        if (email.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = appString(com.aus.ausgegeben.R.string.auth_error_email_required))
            }
            return
        }
        if (password.length < 6) {
            _uiState.update {
                it.copy(errorMessage = appString(com.aus.ausgegeben.R.string.auth_error_password_short))
            }
            return
        }
        if (state.selectedTab == AuthTab.SIGN_UP && password != state.confirmPassword) {
            _uiState.update {
                it.copy(errorMessage = appString(com.aus.ausgegeben.R.string.auth_error_password_mismatch))
            }
            return
        }

        viewModelScope.launch {
            val loadingMessage = when (state.selectedTab) {
                AuthTab.SIGN_IN -> appString(com.aus.ausgegeben.R.string.auth_loading_sign_in)
                AuthTab.SIGN_UP -> appString(com.aus.ausgegeben.R.string.auth_loading_sign_up)
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

    fun signInWithGoogle(idToken: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    loadingMessage = appString(com.aus.ausgegeben.R.string.auth_loading_sign_in),
                    errorMessage = null,
                    infoMessage = null,
                )
            }
            val result = runCatching {
                withTimeout(AUTH_TIMEOUT_MS) {
                    authRepository.signInWithGoogle(idToken).getOrThrow()
                }
            }
            handleAuthResult(result, onSuccess)
        }
    }

    fun sendPasswordReset() {
        val email = _uiState.value.email.trim()
        if (email.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = appString(com.aus.ausgegeben.R.string.auth_error_email_required))
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
                            infoMessage = appString(com.aus.ausgegeben.R.string.auth_reset_email_sent),
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = error.localizedMessage
                                ?: appString(com.aus.ausgegeben.R.string.auth_error_generic),
                        )
                    }
                },
            )
        }
    }

    fun signOut(onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            authRepository.signOut()
            preferenceManager.setStorageMode(StorageMode.LOCAL)
            onComplete()
        }
    }

    private suspend fun handleAuthResult(result: Result<Unit>, onSuccess: () -> Unit) {
        result.fold(
            onSuccess = {
                preferenceManager.setStorageMode(StorageMode.CLOUD)
                preferenceManager.setAuthGatewayComplete()
                _uiState.update { it.copy(isLoading = false, loadingMessage = null) }
                onSuccess()
                viewModelScope.launch {
                    cloudSyncRepository.fullSync().onSuccess {
                        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
                    }
                }
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
        if (error is TimeoutCancellationException) {
            return appString(com.aus.ausgegeben.R.string.auth_error_timeout)
        }
        return when (error) {
            is FirebaseAuthInvalidUserException ->
                appString(com.aus.ausgegeben.R.string.auth_error_user_not_found)
            is FirebaseAuthInvalidCredentialsException ->
                appString(com.aus.ausgegeben.R.string.auth_error_invalid_credentials)
            is FirebaseAuthUserCollisionException ->
                appString(com.aus.ausgegeben.R.string.auth_error_email_in_use)
            is FirebaseAuthWeakPasswordException ->
                appString(com.aus.ausgegeben.R.string.auth_error_password_short)
            else -> error.localizedMessage
                ?: appString(com.aus.ausgegeben.R.string.auth_error_generic)
        }
    }

    private fun appString(resId: Int): String = getApplication<Application>().getString(resId)
}
