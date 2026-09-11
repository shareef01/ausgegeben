package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.AccountActions
import com.aus.ausgegeben.data.auth.AccountDeletionAuth
import com.aus.ausgegeben.data.auth.AuthRepository
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountDeletionCoordinatorTest {

    private class FakeAccount : AccountActions {
        var pending = false
        var localClearFails = false
        var markResult: Result<Unit> = Result.success(Unit)
        var wipeResult: Result<Unit> = Result.success(Unit)
        var markCalls = 0
        var wipeCalls = 0

        override suspend fun isAccountDeletionPending(): Boolean = pending
        override suspend fun markAccountDeletionPending(): Result<Unit> {
            markCalls += 1
            if (markResult.isSuccess) pending = true
            return markResult
        }
        override suspend fun deleteAllUserData(): Result<Unit> {
            wipeCalls += 1
            return wipeResult
        }
        var localStateCleared = 0
        override suspend fun clearAccountLocalState(): Result<Unit> {
            localStateCleared += 1
            return if (localClearFails) {
                Result.failure(IllegalStateException("local clear"))
            } else {
                Result.success(Unit)
            }
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
    fun deleteAccount_wrongPassword_doesNotWipe() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            reauthResult = Result.failure(IllegalStateException(AuthRepository.WRONG_PASSWORD))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        assertEquals(DeleteAccountOutcome.WrongPassword, coordinator.deleteAccount("x"))
        assertEquals(0, auth.deleteCalls)
        assertEquals(0, account.markCalls)
        assertEquals(0, account.wipeCalls)
        assertFalse(coordinator.state.value.pending)
    }

    @Test
    fun deleteAccount_cancellationRemainsCancellationAndDoesNotWipe() = runTest {
        val account = FakeAccount()
        val auth = object : AccountDeletionAuth {
            override suspend fun reauthenticate(password: String): Result<Unit> {
                throw CancellationException("cancelled")
            }
            override suspend fun deleteAccount(): Result<Unit> = Result.success(Unit)
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        var cancelled = false
        try {
            coordinator.deleteAccount("x")
        } catch (_: CancellationException) {
            cancelled = true
        }
        assertTrue(cancelled)
    }

    @Test
    fun deleteAccount_authDeleteFailure_setsPending() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            deleteResult = Result.failure(IllegalStateException("auth delete"))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
        val outcome = coordinator.deleteAccount("ok")
        assertEquals(DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE), outcome)
        assertTrue(coordinator.state.value.pending)
        assertEquals(1, auth.deleteCalls)
        assertEquals(1, account.markCalls)
        assertEquals(1, account.wipeCalls)
    }

    @Test
    fun deleteAccount_wipeFailure_neverDeletesAuth() = runTest {
        val account = FakeAccount().apply {
            wipeResult = Result.failure(IllegalStateException("quota"))
        }
        val auth = FakeAuth()
        val coordinator = AccountDeletionCoordinator(account, auth)

        assertEquals(
            DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE),
            coordinator.deleteAccount("ok"),
        )
        assertTrue(coordinator.state.value.pending)
        assertEquals(0, auth.deleteCalls)
        assertEquals(0, account.localStateCleared)
    }

    @Test
    fun deleteAccount_markerFailure_neverWipesOrDeletesAuth() = runTest {
        val account = FakeAccount().apply {
            markResult = Result.failure(IllegalStateException("offline"))
        }
        val auth = FakeAuth()
        val coordinator = AccountDeletionCoordinator(account, auth)

        assertEquals(
            DeleteAccountOutcome.Closed(AccountDeletionToast.INCOMPLETE),
            coordinator.deleteAccount("ok"),
        )
        assertEquals(0, account.wipeCalls)
        assertEquals(0, auth.deleteCalls)
        assertFalse(coordinator.state.value.pending)
    }

    @Test
    fun deleteAccount_success() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth()
        val coordinator = AccountDeletionCoordinator(account, auth)
        assertEquals(DeleteAccountOutcome.Success, coordinator.deleteAccount("ok"))
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

    @Test
    fun deleteAccount_localCleanupFailure_isReportedWithoutRelabelingCloudDeletion() = runTest {
        val account = FakeAccount().apply { localClearFails = true }
        val auth = FakeAuth()
        val coordinator = AccountDeletionCoordinator(account, auth)

        assertEquals(
            DeleteAccountOutcome.Closed(AccountDeletionToast.LOCAL_DATA_REMAINS),
            coordinator.deleteAccount("ok"),
        )
        assertEquals(1, auth.deleteCalls)
        assertEquals(1, account.localStateCleared)
    }

    /** A failed callable may be partial, so the local copy must stay for recovery. */
    @Test
    fun deleteAccount_failedWipe_keepsLocalState() = runTest {
        val account = FakeAccount()
        val auth = FakeAuth().apply {
            deleteResult = Result.failure(IllegalStateException("callable failed"))
        }
        val coordinator = AccountDeletionCoordinator(account, auth)
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
