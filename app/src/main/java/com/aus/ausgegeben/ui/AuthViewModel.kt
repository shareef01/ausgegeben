package com.aus.ausgegeben.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.StorageMode
import com.aus.ausgegeben.data.auth.AuthRepository
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
    val errorMessage: String? = null,
    val passwordVisible: Boolean = false,
)

class AuthViewModel(
    application: Application,
    private val authRepository: AuthRepository,
    private val preferenceManager: PreferenceManager,
) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun onTabSelected(tab: AuthTab) {
        _uiState.update {
            it.copy(
                selectedTab = tab,
                errorMessage = null,
                confirmPassword = "",
            )
        }
    }

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
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

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
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
            _uiState.update { it.copy(errorMessage = getApplication<Application>().getString(com.aus.ausgegeben.R.string.auth_error_email_required)) }
            return
        }
        if (password.length < 6) {
            _uiState.update { it.copy(errorMessage = getApplication<Application>().getString(com.aus.ausgegeben.R.string.auth_error_password_short)) }
            return
        }
        if (state.selectedTab == AuthTab.SIGN_UP && password != state.confirmPassword) {
            _uiState.update { it.copy(errorMessage = getApplication<Application>().getString(com.aus.ausgegeben.R.string.auth_error_password_mismatch)) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val result = when (state.selectedTab) {
                AuthTab.SIGN_IN -> authRepository.signIn(email, password)
                AuthTab.SIGN_UP -> authRepository.signUp(email, password)
            }
            result.fold(
                onSuccess = {
                    preferenceManager.setStorageMode(StorageMode.CLOUD)
                    preferenceManager.setAuthGatewayComplete()
                    _uiState.update { it.copy(isLoading = false) }
                    onSuccess()
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = mapAuthError(error),
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

    private fun mapAuthError(error: Throwable): String {
        val app = getApplication<Application>()
        return when (error) {
            is FirebaseAuthInvalidUserException ->
                app.getString(com.aus.ausgegeben.R.string.auth_error_user_not_found)
            is FirebaseAuthInvalidCredentialsException ->
                app.getString(com.aus.ausgegeben.R.string.auth_error_invalid_credentials)
            is FirebaseAuthUserCollisionException ->
                app.getString(com.aus.ausgegeben.R.string.auth_error_email_in_use)
            is FirebaseAuthWeakPasswordException ->
                app.getString(com.aus.ausgegeben.R.string.auth_error_password_short)
            else -> error.localizedMessage
                ?: app.getString(com.aus.ausgegeben.R.string.auth_error_generic)
        }
    }
}
