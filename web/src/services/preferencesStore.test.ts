import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  seedOnboardingForUser,
  shouldShowOnboarding,
  usePreferencesStore,
} from '@/services/preferencesStore';
import type { SyncedPreferences } from '@/models/types';

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
    vi.restoreAllMocks();
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

  it('advances monotonically when the device clock moves backwards', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    usePreferencesStore.setState({ preferencesUpdatedAt: 200 });
    usePreferencesStore.getState().setCurrency('USD');
    expect(usePreferencesStore.getState().preferencesUpdatedAt).toBe(201);
  });

  it('marks onboarding as known when the local flag is restored', () => {
    storage[KEY] = 'true';
    seedOnboardingForUser(UID);
    expect(usePreferencesStore.getState().onboardingKnown).toBe(true);
  });
});

/**
 * The onboarding gate has three states, not two. Rendering onboarding whenever
 * `onboardingComplete` is false re-entered onboarding for returning accounts whenever
 * the preference snapshot was slow or unusable (the value was still the store default).
 */
describe('shouldShowOnboarding', () => {
  const loaded = { status: 'loaded' as const };

  it('shows onboarding only for a known, incomplete account', () => {
    expect(shouldShowOnboarding({ ...loaded, onboardingKnown: true, onboardingComplete: false })).toBe(true);
  });

  it('never shows it for a known, completed account', () => {
    expect(shouldShowOnboarding({ ...loaded, onboardingKnown: true, onboardingComplete: true })).toBe(false);
  });

  it('does not guess while the value is unknown', () => {
    expect(shouldShowOnboarding({ ...loaded, onboardingKnown: false, onboardingComplete: false })).toBe(false);
  });

  it('waits for an authoritative status', () => {
    expect(
      shouldShowOnboarding({ status: 'loading', onboardingKnown: true, onboardingComplete: false }),
    ).toBe(false);
    expect(
      shouldShowOnboarding({ status: 'error', onboardingKnown: true, onboardingComplete: false }),
    ).toBe(false);
  });
});

describe('onboardingKnown lifecycle', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {};
    installFakeStorage(storage);
    usePreferencesStore.setState({
      onboardingComplete: false,
      onboardingKnown: false,
      preferencesStatus: 'idle',
      preferencesUpdatedAt: 0,
    });
  });

  it('becomes known when a cloud snapshot is applied', () => {
    const remote: SyncedPreferences = {
      currency: 'EUR',
      locale: 'en',
      themeMode: 'system',
      onboardingComplete: true,
      dailyReminder: true,
      reminderHour: 19,
      reminderMinute: 0,
      analyticsPeriod: 'this_month',
      monthlyBudget: null,
      updatedAt: 10,
    };
    usePreferencesStore.getState().applySyncedPreferences(remote);
    expect(usePreferencesStore.getState().onboardingKnown).toBe(true);
    expect(usePreferencesStore.getState().onboardingComplete).toBe(true);
  });

  it('does not re-enter onboarding when a stale snapshot says it is incomplete', () => {
    // This device completed onboarding locally; the cloud write may still be in flight,
    // so the next snapshot can carry the older `false`. Completion is one-way.
    usePreferencesStore.getState().completeOnboarding();
    const staleRemote: SyncedPreferences = {
      currency: 'EUR',
      locale: 'en',
      themeMode: 'system',
      onboardingComplete: false,
      dailyReminder: true,
      reminderHour: 19,
      reminderMinute: 0,
      analyticsPeriod: 'this_month',
      monthlyBudget: null,
      updatedAt: 5,
    };
    usePreferencesStore.getState().applySyncedPreferences(staleRemote);
    expect(usePreferencesStore.getState().onboardingComplete).toBe(true);
    expect(usePreferencesStore.getState().onboardingKnown).toBe(true);
  });

  it('becomes known when the user completes onboarding', () => {
    usePreferencesStore.getState().completeOnboarding();
    expect(usePreferencesStore.getState().onboardingKnown).toBe(true);
  });

  it('is forgotten on reset so a different account cannot inherit the answer', () => {
    usePreferencesStore.getState().completeOnboarding();
    usePreferencesStore.getState().resetPreferences();
    expect(usePreferencesStore.getState().onboardingKnown).toBe(false);
    expect(usePreferencesStore.getState().onboardingComplete).toBe(false);
  });

  it('returns the load state to idle on reset, so a stale error/loaded state cannot leak across accounts', () => {
    usePreferencesStore.getState().setPreferencesStatus('error');
    usePreferencesStore.getState().resetPreferences();
    expect(usePreferencesStore.getState().preferencesStatus).toBe('idle');
  });
});

/**
 * Account switching without a signed-out state (signInWithEmailAndPassword replaces the
 * user directly). Without a per-account latch, account A's completion answer and settings
 * would be inherited by B — B would skip onboarding and A's currency/budget could be
 * pushed onto B's document.
 */
describe('beginPreferencesForUser', () => {
  beforeEach(() => {
    installFakeStorage({});
    usePreferencesStore.getState().resetPreferences();
  });

  it('keeps state when the same account reloads', () => {
    usePreferencesStore.getState().beginPreferencesForUser('user-a');
    usePreferencesStore.getState().applySyncedPreferences({
      currency: 'USD',
      locale: 'de',
      themeMode: 'dark',
      onboardingComplete: true,
      dailyReminder: false,
      reminderHour: 8,
      reminderMinute: 30,
      analyticsPeriod: 'this_month',
      monthlyBudget: 500,
      updatedAt: 10,
    });

    usePreferencesStore.getState().beginPreferencesForUser('user-a');

    const state = usePreferencesStore.getState();
    expect(state.currency).toBe('USD');
    expect(state.locale).toBe('de');
    expect(state.onboardingComplete).toBe(true);
    expect(state.onboardingKnown).toBe(true);
    expect(state.preferencesStatus).toBe('loading');
  });

  it('resets settings and the onboarding answer when the account changes', () => {
    usePreferencesStore.getState().beginPreferencesForUser('user-a');
    usePreferencesStore.getState().applySyncedPreferences({
      currency: 'USD',
      locale: 'de',
      themeMode: 'dark',
      onboardingComplete: true,
      dailyReminder: false,
      reminderHour: 8,
      reminderMinute: 30,
      analyticsPeriod: 'this_month',
      monthlyBudget: 500,
      updatedAt: 10,
    });

    usePreferencesStore.getState().beginPreferencesForUser('user-b');

    const state = usePreferencesStore.getState();
    expect(state.currency).toBe('EUR');
    expect(state.locale).toBe('en');
    expect(state.monthlyBudget).toBeNull();
    expect(state.onboardingComplete).toBe(false);
    expect(state.onboardingKnown).toBe(false);
    expect(state.preferencesActiveUid).toBe('user-b');
  });

  it('stops loading without forgetting whose values are held', () => {
    usePreferencesStore.getState().beginPreferencesForUser('user-a');
    usePreferencesStore.getState().endPreferences();
    expect(usePreferencesStore.getState().preferencesStatus).toBe('idle');
    expect(usePreferencesStore.getState().preferencesActiveUid).toBe('user-a');
  });
});
