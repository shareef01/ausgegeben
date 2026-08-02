import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedOnboardingForUser, usePreferencesStore } from '@/services/preferencesStore';

/**
 * seedOnboardingForUser restores the onboarding gate from localStorage. It must
 * NOT go through completeOnboarding(): that bumps preferencesUpdatedAt, and
 * preferencesSync pushes to Firestore on every timestamp change — seeding would
 * overwrite a returning verified user's real cloud preferences with defaults on
 * every reload. The store subscription (preferencesSync.ts:244) returns early
 * when preferencesUpdatedAt is unchanged, so keeping the timestamp at 0 is what
 * makes the seed silent.
 */
function installFakeStorage(store: Record<string, string>) {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  } as Storage;
}

const UID = 'seed-test-user';
const KEY = `ausgegeben-onboarding-complete:${UID}`;

describe('seedOnboardingForUser', () => {
  let storage: Record<string, string>;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    storage = {};
    originalLocalStorage = globalThis.localStorage;
    installFakeStorage(storage);
    usePreferencesStore.setState({ onboardingComplete: false, preferencesUpdatedAt: 0 });
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as unknown as { localStorage: Storage }).localStorage = originalLocalStorage;
    }
  });

  it('seeds onboardingComplete without bumping preferencesUpdatedAt', () => {
    storage[KEY] = 'true';
    seedOnboardingForUser(UID);
    const s = usePreferencesStore.getState();
    expect(s.onboardingComplete).toBe(true);
    // No clock bump → the preferencesSync subscription sees no change and
    // never pushes defaults over the user's real cloud prefs.
    expect(s.preferencesUpdatedAt).toBe(0);
  });

  it('does nothing when no flag is stored', () => {
    seedOnboardingForUser(UID);
    const s = usePreferencesStore.getState();
    expect(s.onboardingComplete).toBe(false);
    expect(s.preferencesUpdatedAt).toBe(0);
  });

  it('does not touch an already-onboarded state', () => {
    usePreferencesStore.setState({ onboardingComplete: true, preferencesUpdatedAt: 12345 });
    seedOnboardingForUser(UID);
    expect(usePreferencesStore.getState().preferencesUpdatedAt).toBe(12345);
  });
});
