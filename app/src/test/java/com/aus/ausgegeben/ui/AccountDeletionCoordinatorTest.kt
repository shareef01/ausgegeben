package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.AccountActions
import com.aus.ausgegeben.data.auth.AccountDeletionAuth
import com.aus.ausgegeben.data.auth.AuthRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountDeletionCoordinatorTest {

    private class FakeAccount : AccountActions {
        var pending = false
        var seeded = 0
        var wipeCalls = 0
        var markFails = false
        var wipeFails = false
        var clearFails = false

        override suspend fun isAccountDeletionPending(): Boolean = pending
        override suspend fun markAccountDeletionPending(): Result<Unit> =
            if (markFails) Result.failure(IllegalStateException("mark")) else {
                pending = true
                Result.success(Unit)
            }
        override suspend fun clearAccountDeletionPending(): Result<Unit> =
            if (clearFails) Result.failure(IllegalStateException("clear")) else {
                pending = false
                Result.success(Unit)
            }
        override suspend fun deleteAllUserData(): Result<Unit> {
            wipeCalls += 1
            return if (wipeFails) Result.failure(IllegalStateException("wipe")) else Result.success(Unit)
        }
        override suspend fun ensureSeeded() {
            seeded += 1
        }
        var localStateCleared = 0
        override suspend fun clearAccountLocalState() {
            localStateCleared += 1
        }
    }

    private class FakeAuth : AccountDeletionAuth {
        var reauthResult: Result<Unit> = Result.success(Unit)
        var deleteResult: Result<Unit> = Result.success(Unit)
        var deleteCalls = 0

        override suspend fun reauthenticate(password: String): Result<Unit> = reauthResult
        override suspend fun deleteAccount(): Result<Unit> {
            deleteCalls += 1
            return deleteResult
        }
    }

    @Test
    fun refresh_surfacesPendingMarker() = runTest {
        val account = FakeAccount().apply { pending = true }
        val coordinator = AccountDeletionCoordinator(account, FakeAuth())
        coordinator.refresh(signedIn = true)
        assertTrue(coordinator.state.value.pending)
        coordinator.refresh(signedIn = false)
        assertFalse(coordinator.state.value.pending)
    }

    @Test
    fun keepAccount_clearsMarkerAndSeeds() = runTest {
        val account = FakeAccount().apply { pending = true }
        val coordinator = AccountDeletionCoordinator(account, FakeAuth())
        coordinator.refresh(signedIn = true)
        assertEquals(AccountDeletionToast.KEPT, coordinator.keepAccount())
        assertFalse(account.pending)
        assertEquals(1, account.seeded)
        assertFalse(coordinator.state.value.pending)
    }

    @Test
    fun keepAccount_failedClear_doesNotSeed() = runTest {
        val account = FakeAccount().apply {
            pending = true
            clearFails = true
        }
        val coordinator = AccountDeletionCoordinator(account, FakeAuth())
        assertEquals(AccountDeletionToast.KEEP_FAILED, coordinator.keepAccount())
        assertEquals(0, account.seeded)
        assertTrue(account.pending)
    }

    @Test
    fun deleteAccount_wrongPassword_doesNotWipe() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            reauthResult = Result.failure(IllegalStateException(AuthRepository.WRONG_PASSWORD))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        assertEquals(DeleteAccountOutcome.WrongPassword, coordinator.deleteAccount("x"))
        assertEquals(0, account.wipeCalls)
        assertEquals(0, auth.deleteCalls)
        assertFalse(coordinator.state.value.pending)
    }

    @Test
    fun deleteAccount_wipeOkAuthFail_setsPending() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            deleteResult = Result.failure(IllegalStateException("auth delete"))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        val outcome = coordinator.deleteAccount("ok")
        assertEquals(DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE), outcome)
        assertTrue(coordinator.state.value.pending)
        assertEquals(1, account.wipeCalls)
        assertEquals(1, auth.deleteCalls)
    }

    @Test
    fun deleteAccount_success() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth()
        val coordinator = AccountDeletionCoordinator(account, auth)
        assertEquals(DeleteAccountOutcome.Success, coordinator.deleteAccount("ok"))
        assertEquals(1, account.wipeCalls)
        assertEquals(1, auth.deleteCalls)
    }

    /**
     * Deleting an account used to be *less* thorough than signing out of it: signOut()
     * clears DataStore prefs and the Firestore offline cache, the deletion success path
     * cleared neither. The user's cached transaction history and every preference stayed
     * on the device after they asked for all of it to be removed, and the next person to
     * register there inherited the budget and reminder settings. Web has always cleared
     * both, so this was a one-sided gap.
     */
    @Test
    fun deleteAccount_success_clearsLocalState() = runTest {
        val account = FakeAccount()
        val coordinator = AccountDeletionCoordinator(account, FakeAuth())
        assertEquals(DeleteAccountOutcome.Success, coordinator.deleteAccount("ok"))
        assertEquals(1, account.localStateCleared)
    }

    /** A failed wipe leaves the cloud copy in place, so the local copy must stay too. */
    @Test
    fun deleteAccount_failedWipe_keepsLocalState() = runTest {
        val account = FakeAccount().apply { wipeFails = true }
        val coordinator = AccountDeletionCoordinator(account, FakeAuth())
        coordinator.deleteAccount("ok")
        assertEquals(0, account.localStateCleared)
    }

    /** Auth delete failed after a successful wipe — the account still exists, so keep local state. */
    @Test
    fun deleteAccount_incomplete_keepsLocalState() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            deleteResult = Result.failure(IllegalStateException("auth delete"))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        coordinator.deleteAccount("ok")
        assertEquals(0, account.localStateCleared)
    }
}
