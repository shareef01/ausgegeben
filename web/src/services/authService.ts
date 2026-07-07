import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { syncService } from '@/services/syncService';
import { clearLocalUserData } from '@/services/database';
import { shouldClearLocalDataBeforeSync } from '@/utils/shellRouting';
import { t } from '@/i18n';

let unsubscribe: (() => void) | null = null;
let readyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let authEverReady = false;

export function isAuthEverReady(): boolean {
  return authEverReady;
}

function markAuthReady(): void {
  authEverReady = true;
  if (readyFallbackTimer) {
    clearTimeout(readyFallbackTimer);
    readyFallbackTimer = null;
  }
  useAuthStore.getState().setReady(true);
}

function preferGoogleRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return mobile || standalone;
}

function mapGoogleAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : error instanceof Error ? error.message : 'auth_error';
  if (code.includes('auth/popup-closed-by-user') || code.includes('auth/cancelled-popup-request')) {
    return '';
  }
  if (code.includes('auth/network-request-failed')) return t('authErrorNetwork');
  if (code.includes('auth/popup-blocked')) return t('authErrorPopupBlocked');
  return t('authErrorGeneric');
}

export const authService = {
  async completeRedirectSignIn(): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) return;
    try {
      await getRedirectResult(auth);
    } catch (error) {
      const message = mapGoogleAuthError(error);
      if (message) {
        useAuthStore.getState().setSyncError(message);
      }
    }
  },

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
      const { setStorageMode, completeAuthGateway } = usePreferencesStore.getState();
      setUser(user);
      markAuthReady();

      if (user) {
        setStorageMode('cloud');
        completeAuthGateway();
        void (async () => {
          const { lastCloudUserId, setLastCloudUserId } = usePreferencesStore.getState();
          if (shouldClearLocalDataBeforeSync(lastCloudUserId, user.uid)) {
            await clearLocalUserData();
            usePreferencesStore.setState({
              pendingExpenseDeleteCloudIds: [],
              pendingCategoryDeleteCloudIds: [],
              lastCloudSyncAt: null,
            });
          }
          setLastCloudUserId(user.uid);
          try {
            await syncService.fullSync(true);
          } catch (error) {
            console.error('[auth] Post-sign-in sync failed', error);
          }
        })();
      } else {
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

  continueOffline(): void {
    const { setStorageMode, completeAuthGateway } = usePreferencesStore.getState();
    setStorageMode('local');
    completeAuthGateway();
  },

  async signInWithEmail(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await signInWithEmailAndPassword(auth, email.trim(), password);
  },

  async signUpWithEmail(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  },

  async signInWithGoogle(): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    const provider = new GoogleAuthProvider();
    if (preferGoogleRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  },

  async sendPasswordReset(email: string): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('firebase_not_configured');
    const trimmed = email.trim();
    if (!trimmed) throw new Error('auth/email-required');
    await sendPasswordResetEmail(auth, trimmed);
  },

  async signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
    const { setStorageMode, completeAuthGateway } = usePreferencesStore.getState();
    setStorageMode('local');
    completeAuthGateway();
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setSyncError(null);
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
