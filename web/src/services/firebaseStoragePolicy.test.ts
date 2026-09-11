import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPersistentStorageEnabled, setPersistentStorageEnabled } from './firebase';

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
});
