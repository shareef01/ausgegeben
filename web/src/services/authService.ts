import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { clearLocalFirestoreCache, getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { expenseRepository } from '@/repositories/expenseRepository';
import { usePreferencesStore } from '@/services/preferencesStore';

let unsubscribe: (() => void) | null = null;
let readyFallbackTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * deleteUser() rejects with auth/requires-recent-login once the sign-in is older
 * than roughly 5 minutes. Stay well inside that so the check below cannot pass and
 * then have the delete fail anyway.
 */
const RECENT_SIGN_IN_WINDOW_MS = 2 * 60_000;

function hasRecentSignIn(user: User): boolean {
  const lastSignIn = user.metadata.lastSignInTime;
  if (!lastSignIn) return false;
  const at = Date.parse(lastSignIn);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < RECENT_SIGN_IN_WINDOW_MS;
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
    await clearLocalFirestoreCache();
  },

  /**
   * Deletes cloud data then the Firebase Auth user. May throw `requires_recent_login`.
   *
   * The staleness check runs BEFORE the wipe on purpose. deleteAllUserData() is
   * irreversible, so the old order (wipe, then discover the session was too old to
   * delete the account) destroyed the user's entire history and left the account
   * alive — and the next sign-in re-seeded default categories, so it looked like a
   * working fresh account rather than a failure.
   */
  async deleteAccount(): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) throw new Error('not_signed_in');
    if (!hasRecentSignIn(user)) throw new Error('requires_recent_login');
    await expenseRepository.deleteAllUserData();
    try {
      await deleteUser(user);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        throw new Error('requires_recent_login');
      }
      throw err;
    }
    useAuthStore.getState().setUser(null);
    usePreferencesStore.getState().resetPreferences();
    await clearLocalFirestoreCache();
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
