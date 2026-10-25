import { create } from 'zustand';
import type { AppPreferences, ThemeMode, SyncedPreferences } from '@/models/types';
import type { Locale } from '@/i18n';
import { readStoredThemeMode, writeStoredThemeMode } from '@/theme/tokens';
import { useAuthStore } from '@/services/authStore';
import {
  preferencesScreenFor,
  type PreferencesStatus,
} from '@/services/prefsLoadState';

const storedTheme = readStoredThemeMode();

// Onboarding completion is persisted locally per uid so an unverified account
// (whose preferences writes are blocked by firestore.rules until email
// verification) does not re-see the whole onboarding flow on every reload or
// after a sign-out/sign-in. Cloud value wins once it exists —
// applySyncedPreferences overwrites this on the next snapshot.
const ONBOARDING_STORAGE_PREFIX = 'ausgegeben-onboarding-complete:';

function onboardingStorageKey(uid: string): string {
  return `${ONBOARDING_STORAGE_PREFIX}${uid}`;
}

function readStoredOnboarding(uid: string): boolean {
  try {
    return localStorage.getItem(onboardingStorageKey(uid)) === 'true';
  } catch {
    return false;
  }
}

function writeStoredOnboarding(uid: string, complete: boolean) {
  try {
    if (complete) localStorage.setItem(onboardingStorageKey(uid), 'true');
    else localStorage.removeItem(onboardingStorageKey(uid));
  } catch {
    // private mode / storage disabled — memory-only is the previous behaviour
  }
}

/**
 * Seed the onboarding flag from localStorage for a freshly signed-in user.
 * Called from App.tsx when the auth user becomes known — before the Firestore
 * preferences snapshot resolves — so the gate never flashes onboarding at an
 * account that already completed it. A missing/absent cloud doc (unverified
 * account) never fires applySyncedPreferences, so this local value is the only
 * thing standing between them and a repeated onboarding flow.
 *
 * Deliberately does NOT go through completeOnboarding(): that bumps
 * preferencesUpdatedAt, and preferencesSync's store subscription pushes on any
 * timestamp change — seeding would overwrite a returning verified user's real
 * cloud preferences (currency/locale/budget/…) with defaults on every reload.
 * The clock bump is reserved for a genuine completion in OnboardingView.
 */
export function seedOnboardingForUser(uid: string): void {
  if (usePreferencesStore.getState().onboardingComplete) return;
  if (readStoredOnboarding(uid)) {
    // `onboardingKnown` marks this as a real answer rather than a default: the gate
    // only treats onboarding as "not completed" when the value was actually loaded.
    usePreferencesStore.setState({ onboardingComplete: true, onboardingKnown: true });
  }
}

/**
 * Whether the onboarding flow should be shown.
 *
 * Three states, not two: completed, not completed, and *not known yet*. Rendering
 * onboarding on "unknown" is what made a reload intermittently re-enter onboarding
 * for a returning account (the preference snapshot had not resolved, so the store was
 * still on its `false` default). Unknown renders the app shell instead — the safe
 * direction is to never re-onboard an existing account, and a genuinely new account
 * gets onboarding as soon as the (server-confirmed) missing-document path marks the
 * preference known.
 */
export function shouldShowOnboarding(state: {
  status: PreferencesStatus;
  onboardingKnown: boolean;
  onboardingComplete: boolean;
}): boolean {
  return preferencesScreenFor(state) === 'onboarding';
}

const DEFAULT_PREFERENCES: AppPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: (storedTheme as ThemeMode) || 'system',
  onboardingComplete: false,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  monthlyBudget: null,
  preferencesUpdatedAt: 0,
};

function touchPrefs(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}

interface PreferencesStore extends AppPreferences {
  /** Where preference loading stands (see prefsLoadState.ts). */
  preferencesStatus: PreferencesStatus;
  /**
   * The account whose preferences the store currently holds. Used to detect a switch
   * that never passed through a signed-out state (authService signs in directly), so
   * one account's settings and onboarding answer cannot leak into another's session.
   */
  preferencesActiveUid: string | null;
  /**
   * Whether `onboardingComplete` reflects a real answer (local seed, cloud snapshot,
   * or an explicit completion) rather than the store's default.
   */
  onboardingKnown: boolean;
  setCurrency: (currency: string) => void;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  completeOnboarding: () => void;
  setDailyReminder: (enabled: boolean) => void;
  setReminderTime: (hour: number, minute: number) => void;
  setAnalyticsPeriod: (key: string) => void;
  setMonthlyBudget: (amount: number | null) => void;
  applySyncedPreferences: (prefs: SyncedPreferences) => void;
  /** Advance the loading state (see prefsLoadState.ts); never used for guesses. */
  setPreferencesStatus: (status: PreferencesStatus) => void;
  /** Start loading preferences for `uid`, resetting state if this is a different account. */
  beginPreferencesForUser: (uid: string) => void;
  /** Stop loading; the store no longer belongs to a specific account. */
  endPreferences: () => void;
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  ...DEFAULT_PREFERENCES,
  preferencesStatus: 'idle',
  preferencesActiveUid: null,
  onboardingKnown: false,
  beginPreferencesForUser: (uid) =>
    set((state) => {
      // A switch that never emitted a signed-out state (direct sign-in as another
      // account) must not keep the previous account's currency/locale/budget or its
      // onboarding answer: those would be shown to the new user and could be pushed
      // onto their document.
      const switchingAccount = state.preferencesActiveUid !== null && state.preferencesActiveUid !== uid;
      return {
        ...(switchingAccount
          ? {
              ...DEFAULT_PREFERENCES,
              themeMode: readStoredThemeMode() as ThemeMode,
              onboardingKnown: false,
            }
          : {}),
        preferencesStatus: 'loading',
        preferencesActiveUid: uid,
      };
    }),
  /**
   * Stop loading. Deliberately keeps `preferencesActiveUid`: it still identifies whose
   * values are in the store, so a later sign-in as a different account is detected as a
   * switch (and reset) instead of inheriting them. A genuine sign-out goes through
   * `resetPreferences`, which clears it.
   */
  endPreferences: () => set({ preferencesStatus: 'idle' }),
  setCurrency: (currency) => {
    set((state) => ({ currency, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  setLocale: (locale) => {
    set((state) => ({ locale, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  setThemeMode: (themeMode) => {
    writeStoredThemeMode(themeMode);
    set((state) => ({ themeMode, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  completeOnboarding: () => {
    const uid = useAuthStore.getState().user?.uid;
    if (uid) writeStoredOnboarding(uid, true);
    set((state) => ({
      onboardingComplete: true,
      onboardingKnown: true,
      preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt),
    }));
  },
  setDailyReminder: (dailyReminder) => {
    set((state) => ({ dailyReminder, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  setReminderTime: (reminderHour, reminderMinute) => {
    set((state) => ({
      reminderHour,
      reminderMinute,
      preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt),
    }));
  },
  setAnalyticsPeriod: (analyticsPeriod) => {
    set((state) => ({ analyticsPeriod, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  setMonthlyBudget: (monthlyBudget) => {
    set((state) => ({ monthlyBudget, preferencesUpdatedAt: touchPrefs(state.preferencesUpdatedAt) }));
  },
  applySyncedPreferences: (prefs) => {
    writeStoredThemeMode(prefs.themeMode);
    set((state) => ({
      currency: prefs.currency,
      locale: prefs.locale,
      themeMode: prefs.themeMode,
      // Completion is one-way per account: a cloud snapshot that predates this
      // device's local completion (the write was still in flight, or the account was
      // verified later) must not send the user back through onboarding.
      onboardingComplete: prefs.onboardingComplete || state.onboardingComplete,
      // The cloud document is an authoritative answer, including "not completed".
      onboardingKnown: true,
      dailyReminder: prefs.dailyReminder,
      reminderHour: prefs.reminderHour,
      reminderMinute: prefs.reminderMinute,
      analyticsPeriod: prefs.analyticsPeriod,
      monthlyBudget: prefs.monthlyBudget,
      preferencesUpdatedAt: prefs.updatedAt,
    }));
  },
  setPreferencesStatus: (preferencesStatus) => set({ preferencesStatus }),
  resetPreferences: () =>
    set({
      ...DEFAULT_PREFERENCES,
      themeMode: readStoredThemeMode() as ThemeMode,
      preferencesStatus: 'idle',
      preferencesActiveUid: null,
      onboardingKnown: false,
    }),
}));
