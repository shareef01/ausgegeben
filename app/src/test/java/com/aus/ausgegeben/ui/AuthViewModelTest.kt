package com.aus.ausgegeben.ui

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.auth.AuthActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class AuthViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var fakeAuth: FakeAuthActions
    private lateinit var viewModel: AuthViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        fakeAuth = FakeAuthActions()
        val app = ApplicationProvider.getApplicationContext<Application>()
        viewModel = AuthViewModel(app, fakeAuth)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun submit_blankEmail_setsRequiredError() {
        viewModel.submit {}
        assertEquals(
            appString(R.string.auth_error_email_required),
            viewModel.uiState.value.errorMessage,
        )
        assertFalse(fakeAuth.signInCalled)
    }

    @Test
    fun submit_shortPassword_setsShortError() {
        viewModel.onTabSelected(AuthTab.SIGN_UP)
        viewModel.onEmailChange("a@b.com")
        viewModel.onPasswordChange("1234567")
        viewModel.onConfirmPasswordChange("1234567")
        viewModel.submit {}
        assertEquals(
            appString(R.string.auth_error_password_short),
            viewModel.uiState.value.errorMessage,
        )
    }

    @Test
    fun submit_signupPasswordMismatch_setsMismatchError() {
        viewModel.onTabSelected(AuthTab.SIGN_UP)
        viewModel.onEmailChange("a@b.com")
        viewModel.onPasswordChange("password1")
        viewModel.onConfirmPasswordChange("password2")
        viewModel.submit {}
        assertEquals(
            appString(R.string.auth_error_password_mismatch),
            viewModel.uiState.value.errorMessage,
        )
        assertFalse(fakeAuth.signUpCalled)
    }

    @Test
    fun submit_signIn_success_invokesCallback() = runTest(dispatcher) {
        var success = false
        viewModel.onEmailChange("a@b.com")
        viewModel.onPasswordChange("password1")
        viewModel.submit { success = true }
        advanceUntilIdle()
        assertTrue(fakeAuth.signInCalled)
        assertTrue(success)
        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun sendPasswordReset_blankEmail_setsRequiredError() {
        viewModel.sendPasswordReset()
        assertEquals(
            appString(R.string.auth_error_email_required),
            viewModel.uiState.value.errorMessage,
        )
    }

    @Test
    fun sendPasswordReset_success_setsInfo() = runTest(dispatcher) {
        viewModel.onEmailChange("a@b.com")
        viewModel.sendPasswordReset()
        advanceUntilIdle()
        assertTrue(fakeAuth.resetCalled)
        assertEquals(
            appString(R.string.auth_reset_email_sent),
            viewModel.uiState.value.infoMessage,
        )
    }

    private fun appString(id: Int): String =
        ApplicationProvider.getApplicationContext<Application>().getString(id)

    private class FakeAuthActions : AuthActions {
        var signInCalled = false
        var signUpCalled = false
        var resetCalled = false

        override suspend fun signIn(email: String, password: String): Result<Unit> {
            signInCalled = true
            return Result.success(Unit)
        }

        override suspend fun signUp(email: String, password: String): Result<Unit> {
            signUpCalled = true
            return Result.success(Unit)
        }

        override suspend fun sendPasswordResetEmail(email: String): Result<Unit> {
            resetCalled = true
            return Result.success(Unit)
        }

        override suspend fun signOut() = Unit
    }
}
