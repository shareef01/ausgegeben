package com.aus.ausgegeben.data.auth

import com.aus.ausgegeben.data.FirestoreClient
import com.aus.ausgegeben.data.PreferenceManager
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
    private val preferenceManager: PreferenceManager,
    private val firestoreClient: FirestoreClient,
) : AuthActions {
    private val _authUser = MutableStateFlow(firebaseAuth.currentUser)
    val authState: StateFlow<FirebaseUser?> = _authUser.asStateFlow()

    init {
        firebaseAuth.addAuthStateListener { auth ->
            _authUser.value = auth.currentUser
        }
    }

    val currentUser: FirebaseUser?
        get() = firebaseAuth.currentUser

    val currentUserId: String?
        get() = firebaseAuth.currentUser?.uid

    override suspend fun signIn(email: String, password: String): Result<Unit> = runCatching {
        firebaseAuth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    override suspend fun signUp(email: String, password: String): Result<Unit> = runCatching {
        val result = firebaseAuth.createUserWithEmailAndPassword(email.trim(), password).await()
        result.user?.sendEmailVerification()?.await()
    }

    override suspend fun sendPasswordResetEmail(email: String): Result<Unit> = runCatching {
        firebaseAuth.sendPasswordResetEmail(email.trim()).await()
    }

    suspend fun sendEmailVerification(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser ?: error("Not signed in")
        user.sendEmailVerification().await()
    }

    /** Reloads the Firebase user so emailVerified reflects inbox confirmation. */
    suspend fun reloadCurrentUser(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser ?: error("Not signed in")
        user.reload().await()
        _authUser.value = firebaseAuth.currentUser
    }

    override suspend fun signOut() {
        firebaseAuth.signOut()
        preferenceManager.clearAccountLocalState()
        firestoreClient.clearOfflineCache()
    }

    /** Deletes the Firebase Auth user. Caller should wipe Firestore data first. */
    suspend fun deleteAccount(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser ?: error("Not signed in")
        user.delete().await()
        preferenceManager.clearAccountLocalState()
        firestoreClient.clearOfflineCache()
    }
}
