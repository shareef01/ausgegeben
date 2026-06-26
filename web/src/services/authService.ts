import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { syncService } from '@/services/syncService';

let unsubscribe: (() => void) | null = null;

export const authService = {
  startListener(): void {
    if (unsubscribe) return;
    const auth = getFirebaseAuth();
    if (!auth) {
      useAuthStore.getState().setReady(true);
      return;
    }

    unsubscribe = onAuthStateChanged(auth, async (user) => {
      const { setUser, setReady } = useAuthStore.getState();
      const { setStorageMode, completeAuthGateway, storageMode } = usePreferencesStore.getState();
      setUser(user);
      if (user) {
        if (storageMode !== 'cloud') {
          setStorageMode('cloud');
          completeAuthGateway();
        }
        await syncService.fullSync();
      }
      setReady(true);
    });
  },

  stopListener(): void {
    unsubscribe?.();
    unsubscribe = null;
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
    await signInWithPopup(auth, new GoogleAuthProvider());
  },

  async signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
    usePreferencesStore.getState().setStorageMode('local');
    useAuthStore.getState().setUser(null);
  },

  isAvailable(): boolean {
    return isFirebaseConfigured();
  },
};
