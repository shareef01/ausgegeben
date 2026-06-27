package com.aus.ausgegeben.sync

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class CloudAuthManager(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    private val _currentUser = MutableStateFlow(auth.currentUser)
    val currentUser: StateFlow<FirebaseUser?> = _currentUser.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private var authListener: FirebaseAuth.AuthStateListener? = null
    private var onSignedIn: (suspend (FirebaseUser) -> Unit)? = null
    private var syncScope: CoroutineScope? = null

    val isSignedIn: Boolean get() = _currentUser.value != null

    fun start(scope: CoroutineScope, onSignedInCallback: suspend (FirebaseUser) -> Unit) {
        onSignedIn = onSignedInCallback
        syncScope = scope
        if (authListener != null) {
            auth.currentUser?.let { user -> scope.launch { onSignedInCallback(user) } }
            return
        }
        authListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            val previousUid = _currentUser.value?.uid
            _currentUser.value = user
            if (user != null && user.uid != previousUid) {
                syncScope?.launch { onSignedIn?.invoke(user) }
            }
        }.also { auth.addAuthStateListener(it) }
        _currentUser.value = auth.currentUser
        auth.currentUser?.let { user -> scope.launch { onSignedInCallback(user) } }
    }

    fun stop() {
        authListener?.let { auth.removeAuthStateListener(it) }
        authListener = null
        onSignedIn = null
        syncScope = null
    }

    internal fun setSyncing(value: Boolean) {
        _isSyncing.value = value
    }

    suspend fun signInWithEmail(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signUpWithEmail(email: String, password: String) {
        auth.createUserWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signOut() {
        auth.signOut()
        _currentUser.value = null
    }
}
