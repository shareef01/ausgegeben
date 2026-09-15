import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  broadcastSessionInvalidated,
  clearLocalFirestoreCache,
  clearResidualAuthStorage,
  getFirebaseAuth,
  isFirebaseConfigured,
  isPersistentAuthEnabled,
  onSessionInvalidatedBroadcast,
  resetPersistentStorageEnabled,
  setAuthPersistenceTarget,
  setPersistentAuthEnabled,
} from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { expenseRepository, invalidateAllExpensesCache } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { clearExpenseSubmissionJournal } from '@/services/expenseSubmissionJournal';

let unsubscribe: (() => void) | null = null;
let unsubscribeSessionInvalidated: (() => void) | null = null;
let readyFallbackTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * React to another tab's sign-out/account deletion (AUTH-2). This mirrors exactly the
 * local in-memory state signOut()/deleteAccount() already set in the tab that initiated
 * them — it deliberately does not call Firebase's own signOut() again (that tab's own
 * Auth state is already correct) and does not touch the Firestore disk cache (the
 * existing cache-clear broadcast already handles that independently). Setting the auth
 * store's user to null is what actually stops further writes: every repository write
 * function reads the uid from this store first and refuses before any Firestore call
 * when it is absent, and the top-level app view unmounts the signed-in UI (detaching its
 * listeners) the same way it does for a same-tab sign-out.
 */
function handleSessionInvalidatedElsewhere(): void {
  useAuthStore.getState().setUser(null);
  usePreferencesStore.getState().resetPreferences();
  invalidateAllExpensesCache();
}

function markAuthReady(): void {
  if (readyFallbackTimer) {
    clearTimeout(readyFallbackTimer);
    readyFallbackTimer = null;
  }
  useAuthStore.getState().setReady(true);
}

export const authService = {
  startListener(): void {
    if (unsubscribe) return;
    const auth = getFirebaseAuth();
    if (!auth) {
      markAuthReady();
      return;
    }

    readyFallbackTimer = setTimeout(() => {
      if (!useAuthStore.getState().ready) {
        console.warn('[auth] Auth state listener timed out; continuing without blocking load');
        markAuthReady();
      }
    }, 12_000);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      const { setUser } = useAuthStore.getState();
      setUser(user);
      markAuthReady();

      if (!user) {
        useAuthStore.getState().setSyncError(null);
      }
    });
    unsubscribeSessionInvalidated ??= onSessionInvalidatedBroadcast(handleSessionInvalidatedElsewhere);
  },

  stopListener(): void {
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeSessionInvalidated?.();
    unsubscribeSessionInvalidated = null;
    if (readyFallbackTimer) {
      clearTimeout(readyFallbackTimer);
      readyFallbackTimer = null;
    }
  },

  async signInWithEmail(email: string, password: string, rememberMe = false): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await setAuthPersistenceTarget(auth, rememberMe);
    await signInWithEmailAndPassword(auth, email.trim(), password);
  },

  async signUpWithEmail(email: string, password: string, rememberMe = false): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await setAuthPersistenceTarget(auth, rememberMe);
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(cred.user);
  },

  async setPersistentAuth(enabled: boolean): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) {
      await setAuthPersistenceTarget(auth, enabled);
    } else {
      setPersistentAuthEnabled(enabled);
    }
  },

  isPersistentAuth(): boolean {
    return isPersistentAuthEnabled();
  },

  async sendPasswordResetEmail(email: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await sendPasswordResetEmail(auth, email.trim());
  },

  async resendVerificationEmail(): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) throw new Error('not_signed_in');
    await sendEmailVerification(user);
  },

  /**
   * reload() refreshes profile fields but keeps the cached ID token, whose
   * email_verified claim Firestore rules read. Force a new token so writes
   * are accepted immediately after the user confirms their email.
   */
  async refreshUser(): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) return;
    await user.reload();
    await user.getIdToken(true);
    useAuthStore.getState().setUser(auth.currentUser);
  },

  async signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    const uid = auth?.currentUser?.uid;
    if (auth) await signOut(auth);
    if (uid) await clearExpenseSubmissionJournal(uid);
    setPersistentAuthEnabled(false);
    // Consent to durable, on-disk Firestore caching does not carry from one account to
    // the next on a shared browser. See AUTH-1 — without this, the next person to sign
    // in on this browser silently inherited disk-backed caching they never opted into.
    resetPersistentStorageEnabled();
    clearResidualAuthStorage();
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    // The all-time scan is memoised in module scope; drop it so the next person
    // on a shared browser cannot be served the previous account's transactions.
    invalidateAllExpensesCache();
    // Tell every other open tab this account signed out (AUTH-2) — session-only
    // persistence has no built-in cross-tab signal, so without this a tab that did not
    // itself sign out could keep rendering as authenticated and keep writing to
    // Firestore indefinitely.
    broadcastSessionInvalidated();
    await clearLocalFirestoreCache();
  },

  /** Spark-safe protocol: reauth, freeze writes, server-verified wipe, then Auth delete. */
  async deleteAccount(password: string): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user?.email) throw new Error('not_signed_in');
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
      // Firestore rules independently require this recent auth_time for the marker.
      await user.getIdToken(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // Firebase collapsed wrong-password into invalid-credential on newer projects.
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        throw new Error('wrong_password');
      }
      if (code === 'auth/too-many-requests') throw new Error('too_many_requests');
      throw err;
    }
    await expenseRepository.markAccountDeletionPending();
    await expenseRepository.deleteAllUserData();

    try {
      await deleteUser(user);
    } catch (error) {
      // A response can be lost after Auth accepted deletion. Reload distinguishes that
      // from a retryable terminal-stage failure; the marker remains either way.
      try {
        await user.reload();
        throw new Error('deletion_incomplete', { cause: error });
      } catch (reloadError) {
        if ((reloadError as { code?: string })?.code !== 'auth/user-not-found') {
          if ((reloadError as Error)?.message === 'deletion_incomplete') throw reloadError;
          throw new Error('deletion_incomplete', { cause: error });
        }
      }
    }

    setPersistentAuthEnabled(false);
    // See AUTH-1: reset the "trusted device" preference too, not just the auth
    // persistence flag, so a deleted account's opt-in cannot carry to whoever signs
    // into this browser next.
    resetPersistentStorageEnabled();
    clearResidualAuthStorage();
    await clearExpenseSubmissionJournal(user.uid);
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    invalidateAllExpensesCache();
    // See AUTH-2: tell every other open tab this account is gone.
    broadcastSessionInvalidated();
    try {
      await clearLocalFirestoreCache();
    } catch (error) {
      // The account is already gone. Do not retry deletion or misreport this as an
      // incomplete cloud deletion merely because local IndexedDB cleanup failed.
      throw new Error('local_cleanup_failed', { cause: error });
    }
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
