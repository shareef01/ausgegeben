package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * AUD-007: per-account ViewModels were keyed by uid in the Activity's store and never
 * cleared, so every earlier account's instances (and their flows) stayed alive.
 */
class AccountViewModelStoresTest {

    class Probe : ViewModel() {
        var cleared = false
        override fun onCleared() { cleared = true }
    }

    private val factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = Probe() as T
    }

    private fun probeIn(store: ViewModelStore): Probe = ViewModelProvider(store, factory)[Probe::class.java]

    @Test
    fun sameAccount_keepsTheSameStoreAndInstance() {
        val holder = AccountViewModelStores()
        val first = probeIn(holder.storeFor("alice"))
        // A recomposition or an Activity recreation asks again for the same account.
        assertSame(first, probeIn(holder.storeFor("alice")))
        assertFalse(first.cleared)
    }

    @Test
    fun switchingAccount_clearsThePreviousAccountsViewModels() {
        val holder = AccountViewModelStores()
        val alice = probeIn(holder.storeFor("alice"))
        val bob = probeIn(holder.storeFor("bob"))

        assertTrue("the previous account's ViewModel must be cleared", alice.cleared)
        assertNotSame(alice, bob)
        assertFalse(bob.cleared)
    }

    @Test
    fun signingOut_clearsTheAccountsViewModels() {
        val holder = AccountViewModelStores()
        val alice = probeIn(holder.storeFor("alice"))
        probeIn(holder.storeFor(null))
        assertTrue(alice.cleared)
    }

    @Test
    fun switchingBackAndForth_neverKeepsMoreThanTheCurrentAccount() {
        val holder = AccountViewModelStores()
        val created = mutableListOf<Probe>()
        repeat(3) {
            created += probeIn(holder.storeFor("alice"))
            created += probeIn(holder.storeFor("bob"))
        }
        assertEquals("only the current account's ViewModel is alive", 1, created.count { !it.cleared })
        assertFalse(created.last().cleared)
    }

    @Test
    fun clearingTheHolder_clearsTheCurrentAccountToo() {
        // The holder lives in the Activity's store; when the Activity finishes it is cleared.
        val activityStore = ViewModelStore()
        val holder = ViewModelProvider(activityStore, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = AccountViewModelStores() as T
        })[AccountViewModelStores::class.java]
        val alice = probeIn(holder.storeFor("alice"))

        activityStore.clear()

        assertTrue(alice.cleared)
    }
}
