import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from './authService';
import * as firebaseServices from './firebase';

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
});
