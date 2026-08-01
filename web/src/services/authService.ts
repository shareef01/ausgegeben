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
import { clearLocalFirestoreCache, getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { expenseRepository, invalidateAllExpensesCache } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';

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
    if (auth) await signOut(auth);
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    // The all-time scan is memoised in module scope; drop it so the next person
    // on a shared browser cannot be served the previous account's transactions.
    invalidateAllExpensesCache();
    await clearLocalFirestoreCache();
  },

  /**
   * Reauthenticates with the given password, then deletes cloud data and the Auth user.
   * Throws `wrong_password` or `too_many_requests` if reauthentication fails.
   * Throws `deletion_incomplete` if cloud wipe succeeded but Auth delete failed —
   * re-seeding is blocked via meta/accountDeletion until Auth delete succeeds.
   *
   * Order matters. deleteAllUserData() is irreversible, and deleteUser() rejects with
   * auth/requires-recent-login once the sign-in is more than ~5 minutes old — the common
   * case, not an edge case. Wiping first meant that rejection destroyed the user's entire
   * history while leaving the account alive, and the next sign-in re-seeded default
   * categories so it looked like a working fresh account rather than a failure.
   *
   * Reauthenticating up front both guarantees the delete cannot fail for staleness and
   * gives us a hard confirmation gate on an irreversible action. A pendingDeletion marker
   * is written before the wipe so ensureSeeded will not re-seed if Auth delete still fails.
   */
  async deleteAccount(password: string): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user?.email) throw new Error('not_signed_in');
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
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
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await deleteUser(user);
        useAuthStore.getState().setUser(null);
        usePreferencesStore.getState().resetPreferences();
        invalidateAllExpensesCache();
        await clearLocalFirestoreCache();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
    throw new Error('deletion_incomplete', { cause: lastError });
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
