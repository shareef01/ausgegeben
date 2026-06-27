package com.aus.ausgegeben.data.auth

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class AuthRepository(
    private val appContext: Context,
    private val firebaseAuth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    val currentUser: FirebaseUser?
        get() = firebaseAuth.currentUser

    val currentUserEmail: String?
        get() = firebaseAuth.currentUser?.email

    val currentUserDisplayName: String?
        get() = firebaseAuth.currentUser?.displayName

    val currentUserId: String?
        get() = firebaseAuth.currentUser?.uid

    val currentUserPhotoUrl: String?
        get() = firebaseAuth.currentUser?.photoUrl?.toString()

    val authState: Flow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            trySend(auth.currentUser).isSuccess
        }
        firebaseAuth.addAuthStateListener(listener)
        trySend(firebaseAuth.currentUser)
        awaitClose { firebaseAuth.removeAuthStateListener(listener) }
    }

    suspend fun signIn(email: String, password: String): Result<Unit> = runCatching {
        firebaseAuth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signUp(email: String, password: String): Result<Unit> = runCatching {
        firebaseAuth.createUserWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun sendPasswordResetEmail(email: String): Result<Unit> = runCatching {
        firebaseAuth.sendPasswordResetEmail(email.trim()).await()
    }

    suspend fun signOut() {
        firebaseAuth.signOut()
    }

    /** Forces a fresh ID token so Firestore requests include valid auth credentials. */
    suspend fun ensureFreshAuthToken(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser
            ?: error("Not signed in")
        user.getIdToken(true).await()
    }
}
