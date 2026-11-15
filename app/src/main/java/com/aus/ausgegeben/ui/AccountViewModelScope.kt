package com.aus.ausgegeben.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras

/**
 * Holds the ViewModels that belong to one signed-in account (AUD-007).
 *
 * MainActivity used to key the Record, Insights and Recurring ViewModels by uid in the
 * Activity's own ViewModelStore. A new uid made new instances, but the previous account's
 * were never cleared: their onCleared() never ran and their flows kept running until the
 * Activity died. On a device shared between accounts that kept every earlier account's
 * screens, and their listeners, alive.
 *
 * This holder lives in the Activity's store, so it survives rotation like those ViewModels
 * did. It keeps one ViewModelStore for the current account, and switching accounts (or
 * signing out) clears the previous store, which runs each ViewModel's onCleared() and
 * cancels its viewModelScope, before handing out a fresh one.
 */
class AccountViewModelStores : ViewModel() {
    private var accountKey: String? = null
    private var store: ViewModelStore? = null

    /** The store for [accountKey]; a different key clears the previous account's store first. */
    fun storeFor(accountKey: String?): ViewModelStore {
        val current = store
        if (current != null && accountKey == this.accountKey) return current
        current?.clear()
        return ViewModelStore().also {
            store = it
            this.accountKey = accountKey
        }
    }

    override fun onCleared() {
        store?.clear()
        store = null
    }
}

/**
 * A ViewModelStoreOwner for the signed-in account's ViewModels; pass it to hiltViewModel.
 *
 * It hands out the Activity's default factory and creation extras, so Hilt creates and
 * injects these ViewModels exactly as it did when they lived in the Activity's store.
 */
@Composable
fun rememberAccountViewModelStoreOwner(activity: ComponentActivity, accountKey: String?): ViewModelStoreOwner {
    val holder = remember(activity) { ViewModelProvider(activity)[AccountViewModelStores::class.java] }
    return remember(holder, accountKey) {
        val store = holder.storeFor(accountKey)
        object : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
            override val viewModelStore: ViewModelStore = store
            override val defaultViewModelProviderFactory: ViewModelProvider.Factory
                get() = activity.defaultViewModelProviderFactory
            override val defaultViewModelCreationExtras: CreationExtras
                get() = activity.defaultViewModelCreationExtras
        }
    }
}
