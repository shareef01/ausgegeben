package com.aus.ausgegeben.sync

import android.content.Context
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    val isSignedIn: Boolean get() = _currentUser.value != null

    fun start(onSignedInCallback: suspend (FirebaseUser) -> Unit) {
        onSignedIn = onSignedInCallback
        if (authListener != null) return
        authListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            _currentUser.value = user
        }.also { auth.addAuthStateListener(it) }
        _currentUser.value = auth.currentUser
    }

    fun stop() {
        authListener?.let { auth.removeAuthStateListener(it) }
        authListener = null
        onSignedIn = null
    }

    internal fun setSyncing(value: Boolean) {
        _isSyncing.value = value
    }

    suspend fun signInWithEmail(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
        auth.currentUser?.let { onSignedIn?.invoke(it) }
    }

    suspend fun signUpWithEmail(email: String, password: String) {
        auth.createUserWithEmailAndPassword(email.trim(), password).await()
        auth.currentUser?.let { onSignedIn?.invoke(it) }
    }

    fun googleSignInClient(context: Context): GoogleSignInClient? {
        val clientId = runCatching {
            context.getString(com.aus.ausgegeben.R.string.default_web_client_id)
        }.getOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(clientId)
            .requestEmail()
            .build()
        return GoogleSignIn.getClient(context, options)
    }

    suspend fun signInWithGoogleIdToken(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).await()
        auth.currentUser?.let { onSignedIn?.invoke(it) }
    }

    suspend fun signOut(context: Context) {
        auth.signOut()
        googleSignInClient(context)?.let { runCatching { it.signOut().await() } }
        _currentUser.value = null
    }
}
