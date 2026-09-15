import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPersistentStorageEnabled,
  resetPersistentStorageEnabled,
  setPersistentStorageEnabled,
} from './firebase';

describe('trusted-device storage policy', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults financial persistence off', () => {
    expect(isPersistentStorageEnabled()).toBe(false);
  });

  it('persists explicit trusted-device consent and can revoke it', async () => {
    await setPersistentStorageEnabled(true);
    expect(isPersistentStorageEnabled()).toBe(true);
    await setPersistentStorageEnabled(false);
    expect(isPersistentStorageEnabled()).toBe(false);
  });

  // AUTH-1: a device-wide flag that survives sign-out silently opts the next account
  // into durable, on-disk Firestore caching without their consent.
  it('resetPersistentStorageEnabled clears the preference (best-effort)', async () => {
    await setPersistentStorageEnabled(true);
    expect(isPersistentStorageEnabled()).toBe(true);

    resetPersistentStorageEnabled();

    expect(isPersistentStorageEnabled()).toBe(false);
  });

  it('resetPersistentStorageEnabled never throws, even if storage access fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); },
    });

    expect(() => resetPersistentStorageEnabled()).not.toThrow();
  });
});
