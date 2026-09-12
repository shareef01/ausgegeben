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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
