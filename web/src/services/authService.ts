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
  clearLocalFirestoreCache,
  getFirebaseAuth,
  isFirebaseConfigured,
} from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { expenseRepository, invalidateAllExpensesCache } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';
import { clearExpenseSubmissionJournal } from '@/services/expenseSubmissionJournal';

let unsubscribe: (() => void) | null = null;
let readyFallbackTimer: ReturnType<typeof setTimeout> | null = null;

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
  },

  stopListener(): void {
    unsubscribe?.();
    unsubscribe = null;
    if (readyFallbackTimer) {
      clearTimeout(readyFallbackTimer);
      readyFallbackTimer = null;
    }
  },

  async signInWithEmail(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await signInWithEmailAndPassword(auth, email.trim(), password);
  },

  async signUpWithEmail(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(cred.user);
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
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    // The all-time scan is memoised in module scope; drop it so the next person
    // on a shared browser cannot be served the previous account's transactions.
    invalidateAllExpensesCache();
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

    await clearExpenseSubmissionJournal(user.uid);
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    invalidateAllExpensesCache();
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
