import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearResidualAuthStorage,
  getAuthPersistenceHierarchy,
  isPersistentAuthEnabled,
  isPersistentStorageEnabled,
  setAuthPersistenceTarget,
  setPersistentAuthEnabled,
  setPersistentStorageEnabled,
} from './firebase';
import { browserSessionPersistence, indexedDBLocalPersistence } from 'firebase/auth';

describe('Firebase Auth persistence policy & shared-device privacy', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults Auth persistence to session-based (disabled by default)', () => {
    expect(isPersistentAuthEnabled()).toBe(false);
    const hierarchy = getAuthPersistenceHierarchy();
    // Primary persistence should be browserSessionPersistence
    expect(hierarchy[0]).toBe(browserSessionPersistence);
  });

  it('switches to local persistence hierarchy when explicit persistent auth is enabled', () => {
    setPersistentAuthEnabled(true);
    expect(isPersistentAuthEnabled()).toBe(true);

    const hierarchy = getAuthPersistenceHierarchy();
    expect(hierarchy[0]).toBe(indexedDBLocalPersistence);

    setPersistentAuthEnabled(false);
    expect(isPersistentAuthEnabled()).toBe(false);
    expect(getAuthPersistenceHierarchy()[0]).toBe(browserSessionPersistence);
  });

  it('purges residual firebase auth keys from localStorage when clearResidualAuthStorage is invoked', () => {
    store.set('firebase:authUser:dummy-api-key:[DEFAULT]', JSON.stringify({ uid: 'user-123' }));
    store.set('firebase:appName:dummy-api-key:[DEFAULT]', 'ausgegeben');
    store.set('unrelated-key', 'keep-me');

    clearResidualAuthStorage();

    expect(store.has('firebase:authUser:dummy-api-key:[DEFAULT]')).toBe(false);
    expect(store.has('firebase:appName:dummy-api-key:[DEFAULT]')).toBe(false);
    expect(store.get('unrelated-key')).toBe('keep-me');
  });

  it('keeps persistent storage (Firestore cache) and persistent auth decoupled', async () => {
    // Enabling persistent storage (Firestore disk cache) must NOT enable persistent auth
    await setPersistentStorageEnabled(true);
    expect(isPersistentStorageEnabled()).toBe(true);
    expect(isPersistentAuthEnabled()).toBe(false);
    expect(getAuthPersistenceHierarchy()[0]).toBe(browserSessionPersistence);

    // Enabling persistent auth must NOT automatically force persistent storage
    await setPersistentStorageEnabled(false);
    setPersistentAuthEnabled(true);
    expect(isPersistentAuthEnabled()).toBe(true);
    expect(isPersistentStorageEnabled()).toBe(false);

    // Reset
    setPersistentAuthEnabled(false);
    expect(isPersistentAuthEnabled()).toBe(false);
  });

  it('setAuthPersistenceTarget delegates to setPersistence and cleans storage when set to session', async () => {
    const setPersistenceMock = vi.fn().mockResolvedValue(undefined);
    const mockAuth = {
      _delegate: { setPersistence: setPersistenceMock },
      setPersistence: setPersistenceMock,
    } as any;
    store.set('firebase:authUser:test', 'old-token');

    // Opt into persistent
    await setAuthPersistenceTarget(mockAuth, true);
    expect(isPersistentAuthEnabled()).toBe(true);
    expect(setPersistenceMock).toHaveBeenCalledWith(indexedDBLocalPersistence);

    // Switch back to session mode
    await setAuthPersistenceTarget(mockAuth, false);
    expect(isPersistentAuthEnabled()).toBe(false);
    expect(setPersistenceMock).toHaveBeenCalledWith(browserSessionPersistence);
    // Residual auth keys should be cleared from localStorage
    expect(store.has('firebase:authUser:test')).toBe(false);
  });
});
