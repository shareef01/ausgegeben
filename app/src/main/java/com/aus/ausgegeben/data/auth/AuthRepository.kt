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

/**
 * Immutable projection of the fields the UI actually reads.
 *
 * Publishing the [FirebaseUser] itself was a bug: reload() updates that instance in
 * place, so `_authUser.value = firebaseAuth.currentUser` re-assigned an identical
 * reference. StateFlow conflates by equals and FirebaseUser has no equals override,
 * so the emission was dropped — after a user confirmed their email and hit Refresh,
 * the verify banner stayed up and the seeding effect never re-ran, leaving a freshly
 * verified account with no categories until an app restart.
 *
 * As a data class, equals is value-based: a verification flip now emits, while a bare
 * token refresh (which also fires the auth state listener) still conflates away.
 */
data class AuthUser(
    val uid: String,
    val email: String?,
    val displayName: String?,
    val isEmailVerified: Boolean,
)

private fun FirebaseUser.toAuthUser(): AuthUser =
    AuthUser(uid = uid, email = email, displayName = displayName, isEmailVerified = isEmailVerified)

@Singleton
class AuthRepository @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
    private val preferenceManager: PreferenceManager,
    private val firestoreClient: FirestoreClient,
) : AuthActions {
    private val _authUser = MutableStateFlow(firebaseAuth.currentUser?.toAuthUser())
    val authState: StateFlow<AuthUser?> = _authUser.asStateFlow()

    init {
        firebaseAuth.addAuthStateListener { auth ->
            _authUser.value = auth.currentUser?.toAuthUser()
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

    /**
     * Reloads the Firebase user so emailVerified reflects inbox confirmation.
     *
     * reload() refreshes profile fields but keeps the cached ID token, whose
     * email_verified claim Firestore rules read. Without the forced token
     * refresh below, every write stays denied until the token expires (~1h).
     */
    suspend fun reloadCurrentUser(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser ?: error("Not signed in")
        user.reload().await()
        firebaseAuth.currentUser?.getIdToken(true)?.await()
        _authUser.value = firebaseAuth.currentUser?.toAuthUser()
    }

    override suspend fun signOut() {
        firebaseAuth.signOut()
        preferenceManager.clearAccountLocalState()
        firestoreClient.clearOfflineCache()
    }

    /**
     * True when the session is fresh enough for [deleteAccount] to succeed.
     *
     * FirebaseUser.delete() fails with FirebaseAuthRecentLoginRequiredException once the
     * sign-in is more than roughly 5 minutes old. Callers MUST check this before wiping
     * Firestore data: the wipe is irreversible, so discovering staleness afterwards
     * destroys the user's history and leaves the account alive.
     */
    fun hasRecentSignIn(): Boolean {
        val signedInAt = firebaseAuth.currentUser?.metadata?.lastSignInTimestamp ?: return false
        return System.currentTimeMillis() - signedInAt < RECENT_SIGN_IN_WINDOW_MS
    }

    /** Deletes the Firebase Auth user. Caller should wipe Firestore data first. */
    suspend fun deleteAccount(): Result<Unit> = runCatching {
        val user = firebaseAuth.currentUser ?: error("Not signed in")
        user.delete().await()
        preferenceManager.clearAccountLocalState()
        firestoreClient.clearOfflineCache()
    }

    companion object {
        /** Kept well inside Firebase's ~5 minute recent-login requirement. */
        private const val RECENT_SIGN_IN_WINDOW_MS = 2 * 60 * 1000L
    }
}
