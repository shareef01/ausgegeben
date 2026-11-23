import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from './authService';
import * as firebaseServices from './firebase';
import * as journal from './expenseSubmissionJournal';
import { LocalCleanupError, LOCAL_CLEANUP_PENDING_KEY, resetLocalCleanupForTests } from './localCleanup';
import { expenseRepository } from '@/repositories/expenseRepository';
import { useAuthStore } from './authStore';

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
    resetLocalCleanupForTests();
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

  it('attempts every local wipe when the Firestore cache is blocked, then reports failure', async () => {
    const journalSpy = vi.spyOn(journal, 'clearExpenseSubmissionJournal').mockResolvedValue(false);
    const residualSpy = vi.spyOn(firebaseServices, 'clearResidualAuthStorage');
    vi.spyOn(firebaseServices, 'clearLocalFirestoreCache').mockRejectedValue(new Error('blocked'));
    vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

    await expect(authService.signOut()).rejects.toBeInstanceOf(LocalCleanupError);

    expect(journalSpy).toHaveBeenCalledWith('u1');
    expect(residualSpy).toHaveBeenCalled();
    // The account is signed out (Auth and in-memory state) even though local cleanup is
    // incomplete; a durable marker lets the next launch finish the wipe.
    expect(storageValues.get(LOCAL_CLEANUP_PENDING_KEY)).toContain('u1');
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
      let onInvalidated: ((uid: string | null) => void) | undefined;
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({} as any);
      vi.spyOn(firebaseServices, 'onSessionInvalidatedBroadcast').mockImplementation((handler) => {
        onInvalidated = handler;
        return () => {};
      });
      authService.startListener();
      try {
        onInvalidated?.(null);
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
  // Firebase reports the signed-out user before the local wipe ends. The sign-in form must
  // wait for that wipe: a second account signing in mid-cleanup had its Firestore instance
  // terminated and was then signed out again, in every tab, when the cleanup finished.
  describe('holds the sign-in form until the local wipe has finished', () => {
    afterEach(() => useAuthStore.setState({ endingSession: false, endingSessionHolds: 0 }));

    it('on signOut: set while the cache is being cleared, cleared afterwards', async () => {
      let release!: () => void;
      const seen: boolean[] = [];
      vi.spyOn(firebaseServices, 'clearLocalFirestoreCache').mockImplementation(() => {
        seen.push(useAuthStore.getState().endingSession);
        return new Promise<void>((resolve) => { release = resolve; });
      });
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

      const done = authService.signOut();
      await vi.waitFor(() => expect(seen).toEqual([true]));
      expect(useAuthStore.getState().endingSession).toBe(true);
      release();
      await done;
      expect(useAuthStore.getState().endingSession).toBe(false);
    });

    it('on signOut: cleared even when the wipe fails', async () => {
      vi.spyOn(firebaseServices, 'clearLocalFirestoreCache').mockRejectedValue(new Error('blocked'));
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);

      await expect(authService.signOut()).rejects.toBeInstanceOf(LocalCleanupError);
      expect(useAuthStore.getState().endingSession).toBe(false);
    });

    it('on deleteAccount: set during the local wipe, cleared afterwards', async () => {
      const seen: boolean[] = [];
      vi.spyOn(firebaseServices, 'clearLocalFirestoreCache').mockImplementation(async () => {
        seen.push(useAuthStore.getState().endingSession);
      });
      const user = { uid: 'u1', email: 'a@example.com', getIdToken: vi.fn().mockResolvedValue('t') };
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: user } as any);
      vi.spyOn(expenseRepository, 'markAccountDeletionPending').mockResolvedValue(undefined as any);
      vi.spyOn(expenseRepository, 'deleteAllUserData').mockResolvedValue(undefined as any);

      await authService.deleteAccount('password123');
      expect(seen).toEqual([true]);
      expect(useAuthStore.getState().endingSession).toBe(false);
    });

    it("on another tab's broadcast: set until this tab's own sign-out has run", async () => {
      let onInvalidated: ((uid: string | null) => void) | undefined;
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({} as any);
      vi.spyOn(firebaseServices, 'onSessionInvalidatedBroadcast').mockImplementation((handler) => {
        onInvalidated = handler;
        return () => {};
      });
      authService.startListener();
      try {
        onInvalidated?.(null);
        expect(useAuthStore.getState().endingSession).toBe(true);
        await vi.waitFor(() => expect(useAuthStore.getState().endingSession).toBe(false));
      } finally {
        authService.stopListener();
      }
    });

    // A sign-out broadcast from another tab can arrive while this tab is still wiping its
    // own sign-out. With a single flag, the broadcast handler finished first and cleared
    // it, so the sign-in form came back mid-wipe — the race the flag exists to prevent.
    it("a broadcast arriving during this tab's own sign-out does not lift the hold early", async () => {
      let releaseWipe!: () => void;
      let onInvalidated: ((uid: string | null) => void) | undefined;
      vi.spyOn(firebaseServices, 'clearLocalFirestoreCache').mockImplementation(
        () => new Promise<void>((resolve) => { releaseWipe = resolve; }),
      );
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'u1' } } as any);
      vi.spyOn(firebaseServices, 'onSessionInvalidatedBroadcast').mockImplementation((handler) => {
        onInvalidated = handler;
        return () => {};
      });
      authService.startListener();
      try {
        const done = authService.signOut();
        await vi.waitFor(() => expect(releaseWipe).toBeTypeOf('function'));

        onInvalidated?.('u1'); // another tab signed out of the same account too; its local signOut resolves at once
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(useAuthStore.getState().endingSession).toBe(true); // own wipe still running

        releaseWipe();
        await done;
        expect(useAuthStore.getState().endingSession).toBe(false);
      } finally {
        authService.stopListener();
      }
    });

    it('a release called twice frees only its own hold', () => {
      const first = useAuthStore.getState().beginEndingSession();
      const second = useAuthStore.getState().beginEndingSession();
      first();
      first();
      expect(useAuthStore.getState().endingSession).toBe(true);
      second();
      expect(useAuthStore.getState().endingSession).toBe(false);
      expect(useAuthStore.getState().endingSessionHolds).toBe(0);
    });
  });

  // Session-only tabs each hold their own session. The sign-out message used to carry no
  // account, so signing out in one tab also signed out a different account open in another
  // tab of the same browser.
  describe("another tab's sign-out applies only to the same account", () => {
    let onInvalidated: ((uid: string | null) => void) | undefined;
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
      vi.spyOn(firebaseServices, 'onSessionInvalidatedBroadcast').mockImplementation((handler) => {
        onInvalidated = handler;
        return () => {};
      });
    });
    afterEach(() => {
      authService.stopListener();
      useAuthStore.setState({ user: null, endingSession: false, endingSessionHolds: 0 });
    });

    it('a different account stays signed in', async () => {
      const { signOut } = await import('firebase/auth');
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'bob' } } as any);
      useAuthStore.setState({ user: { uid: 'bob' } as any });
      authService.startListener();

      onInvalidated?.('alice');
      await flush();

      expect(signOut).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user?.uid).toBe('bob');
      expect(useAuthStore.getState().endingSession).toBe(false);
    });

    it('the same account is signed out', async () => {
      const { signOut } = await import('firebase/auth');
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'alice' } } as any);
      useAuthStore.setState({ user: { uid: 'alice' } as any });
      authService.startListener();

      onInvalidated?.('alice');
      await flush();

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('a tab still restoring its session decides once Auth is ready', async () => {
      const { signOut } = await import('firebase/auth');
      const auth: { currentUser: { uid: string } | null; authStateReady: () => Promise<void> } = {
        currentUser: null,
        authStateReady: async () => { auth.currentUser = { uid: 'alice' }; },
      };
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue(auth as any);
      authService.startListener();

      onInvalidated?.('alice');
      await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    });

    it('a signed-out tab, or one signing in to another account, is left alone', async () => {
      const { signOut } = await import('firebase/auth');
      const auth = { currentUser: null, authStateReady: async () => {} };
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue(auth as any);
      authService.startListener();

      onInvalidated?.('alice');
      await flush();
      await flush();

      expect(signOut).not.toHaveBeenCalled();
      expect(useAuthStore.getState().endingSession).toBe(false);
    });

    it('signOut and deleteAccount name their account in the broadcast', async () => {
      const broadcast = vi.spyOn(firebaseServices, 'broadcastSessionInvalidated');
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: { uid: 'alice' } } as any);
      await authService.signOut();
      expect(broadcast).toHaveBeenLastCalledWith('alice');

      const user = { uid: 'carol', email: 'c@example.com', getIdToken: vi.fn().mockResolvedValue('t') };
      vi.spyOn(firebaseServices, 'getFirebaseAuth').mockReturnValue({ currentUser: user } as any);
      vi.spyOn(expenseRepository, 'markAccountDeletionPending').mockResolvedValue(undefined as any);
      vi.spyOn(expenseRepository, 'deleteAllUserData').mockResolvedValue(undefined as any);
      await authService.deleteAccount('password123');
      expect(broadcast).toHaveBeenLastCalledWith('carol');
    });
  });
});

describe('cross-tab lifecycle messages', () => {
  it('reads the account from scoped messages and treats legacy or empty ones as unknown', () => {
    const read = firebaseServices.readLifecycleMessage;
    expect(read({ type: 'session-invalidated', uid: 'alice' }, 'session-invalidated')).toEqual({ uid: 'alice' });
    expect(read('session-invalidated', 'session-invalidated')).toEqual({ uid: null });
    expect(read({ type: 'session-invalidated', uid: '' }, 'session-invalidated')).toEqual({ uid: null });
    expect(read({ type: 'clear-firestore-cache', uid: 'alice' }, 'session-invalidated')).toBeNull();
    expect(read('something-else', 'session-invalidated')).toBeNull();
    expect(read(null, 'session-invalidated')).toBeNull();
  });

  it("closes a memory-only Firestore instance only for its own account's sign-out", () => {
    const close = firebaseServices.peerMustCloseFirestore;
    expect(close('alice', 'bob', false)).toBe(false); // other account, nothing on disk: keep its queue
    expect(close('alice', 'bob', true)).toBe(true); // the shared disk cache must be released
    expect(close('alice', 'alice', false)).toBe(true);
    expect(close(null, 'bob', false)).toBe(true); // unknown account: as before
    expect(close('alice', null, false)).toBe(true); // signed out: nothing to protect
  });
});
