import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from './authService';
import * as firebaseServices from './firebase';
import { expenseRepository } from '@/repositories/expenseRepository';

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }),
  createUserWithEmailAndPassword: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn().mockReturnValue(() => {}),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  browserSessionPersistence: { type: 'SESSION' },
  browserLocalPersistence: { type: 'LOCAL' },
  indexedDBLocalPersistence: { type: 'INDEXEDDB' },
  inMemoryPersistence: { type: 'NONE' },
  reauthenticateWithCredential: vi.fn().mockResolvedValue(undefined),
  EmailAuthProvider: { credential: vi.fn().mockReturnValue({}) },
  deleteUser: vi.fn().mockResolvedValue(undefined),
}));

describe('authService persistence integration', () => {
  const storageValues = new Map<string, string>();

  beforeEach(() => {
    vi.clearAllMocks();
    storageValues.clear();
    // signOut/deleteAccount now also reset the trusted-device storage flag (AUTH-1),
    // which reads/writes localStorage directly — stub it so that path is exercised
    // rather than silently no-op'd by a missing global in this Node test environment.
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storageValues.get(key) ?? null,
      setItem: (key: string, value: string) => storageValues.set(key, value),
      removeItem: (key: string) => storageValues.delete(key),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('signs in with default session persistence when rememberMe is false', async () => {
    const spy = vi.spyOn(firebaseServices, 'setAuthPersistenceTarget');
    vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({} as any);

    await authService.signInWithEmail('test@example.com', 'password123', false);

    expect(spy).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('signs in with persistent auth when rememberMe is true', async () => {
    const spy = vi.spyOn(firebaseServices, 'setAuthPersistenceTarget');
    vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({} as any);

    await authService.signInWithEmail('test@example.com', 'password123', true);

    expect(spy).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('clears persistent auth and residual storage on signOut', async () => {
    const setPersistentSpy = vi.spyOn(firebaseServices, 'setPersistentAuthEnabled');
    const clearResidualSpy = vi.spyOn(firebaseServices, 'clearResidualAuthStorage');
    vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

    await authService.signOut();

    expect(setPersistentSpy).toHaveBeenCalledWith(false);
    expect(clearResidualSpy).toHaveBeenCalled();
  });

  // AUTH-1: a "trusted device" flag left on after sign-out silently opts whoever signs
  // in next on this browser into durable, on-disk Firestore caching.
  it('resets the trusted-device storage preference on signOut', async () => {
    await firebaseServices.setPersistentStorageEnabled(true);
    expect(firebaseServices.isPersistentStorageEnabled()).toBe(true);
    vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

    await authService.signOut();

    expect(firebaseServices.isPersistentStorageEnabled()).toBe(false);
  });

  // UX-4: the shell mounts on whatever `?tab=` names, so every path that ends a session must
  // put it back to Record, or the next person to sign in on this browser lands on the previous
  // session's screen (account deletion always starts on Settings).
  describe('resets the tab named in the URL when a session ends', () => {
    let replaceState: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      replaceState = vi.fn();
      vi.stubGlobal('window', {
        location: { search: '?tab=settings', hash: '' },
        history: { state: null, replaceState },
      });
    });

    it('on signOut', async () => {
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

      await authService.signOut();

      expect(replaceState).toHaveBeenCalledWith(null, '', '?tab=record');
    });

    it('on deleteAccount', async () => {
      const user = { uid: 'u1', email: 'a@example.com', getIdToken: vi.fn().mockResolvedValue('t') };
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: user } as any);
      vi.spyOn(expenseRepository, 'markAccountDeletionPending').mockResolvedValue(undefined as any);
      vi.spyOn(expenseRepository, 'deleteAllUserData').mockResolvedValue(undefined as any);

      await authService.deleteAccount('password123');

      expect(replaceState).toHaveBeenCalledWith(null, '', '?tab=record');
    });

    it('on a sign-out broadcast from another tab', () => {
      let onInvalidated: (() => void) | undefined;
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({} as any);
      vi.spyOn(firebaseServices, 'onSessionInvalidatedBroadcast').mockImplementation((handler) => {
        onInvalidated = handler;
        return () => {};
      });
      authService.startListener();
      try {
        onInvalidated?.();
        expect(replaceState).toHaveBeenCalledWith(null, '', '?tab=record');
      } finally {
        authService.stopListener();
      }
    });

    it('leaves a URL without a tab alone', async () => {
      vi.stubGlobal('window', {
        location: { search: '', hash: '' },
        history: { state: null, replaceState },
      });
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

      await authService.signOut();

      expect(replaceState).not.toHaveBeenCalled();
    });
  });
});
