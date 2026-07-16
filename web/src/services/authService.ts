import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';

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

  async signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
    useAuthStore.getState().setUser(null);
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
