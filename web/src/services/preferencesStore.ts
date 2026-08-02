import { create } from 'zustand';
import type { AppPreferences, ThemeMode, SyncedPreferences } from '@/models/types';
import type { Locale } from '@/i18n';
import { readStoredThemeMode, writeStoredThemeMode } from '@/theme/tokens';
import { useAuthStore } from '@/services/authStore';

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
    usePreferencesStore.setState({ onboardingComplete: true });
  }
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

function touchPrefs(): number {
  return Date.now();
}

interface PreferencesStore extends AppPreferences {
  /** True after the first Firestore preferences snapshot for the signed-in user. */
  preferencesReady: boolean;
  setCurrency: (currency: string) => void;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  completeOnboarding: () => void;
  setDailyReminder: (enabled: boolean) => void;
  setReminderTime: (hour: number, minute: number) => void;
  setAnalyticsPeriod: (key: string) => void;
  setMonthlyBudget: (amount: number | null) => void;
  applySyncedPreferences: (prefs: SyncedPreferences) => void;
  markPreferencesReady: () => void;
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  ...DEFAULT_PREFERENCES,
  preferencesReady: false,
  setCurrency: (currency) => {
    set({ currency, preferencesUpdatedAt: touchPrefs() });
  },
  setLocale: (locale) => {
    set({ locale, preferencesUpdatedAt: touchPrefs() });
  },
  setThemeMode: (themeMode) => {
    writeStoredThemeMode(themeMode);
    set({ themeMode, preferencesUpdatedAt: touchPrefs() });
  },
  completeOnboarding: () => {
    const uid = useAuthStore.getState().user?.uid;
    if (uid) writeStoredOnboarding(uid, true);
    set({ onboardingComplete: true, preferencesUpdatedAt: touchPrefs() });
  },
  setDailyReminder: (dailyReminder) => {
    set({ dailyReminder, preferencesUpdatedAt: touchPrefs() });
  },
  setReminderTime: (reminderHour, reminderMinute) => {
    set({ reminderHour, reminderMinute, preferencesUpdatedAt: touchPrefs() });
  },
  setAnalyticsPeriod: (analyticsPeriod) => {
    set({ analyticsPeriod, preferencesUpdatedAt: touchPrefs() });
  },
  setMonthlyBudget: (monthlyBudget) => {
    set({ monthlyBudget, preferencesUpdatedAt: touchPrefs() });
  },
  applySyncedPreferences: (prefs) => {
    writeStoredThemeMode(prefs.themeMode);
    set({
      currency: prefs.currency,
      locale: prefs.locale,
      themeMode: prefs.themeMode,
      onboardingComplete: prefs.onboardingComplete,
      dailyReminder: prefs.dailyReminder,
      reminderHour: prefs.reminderHour,
      reminderMinute: prefs.reminderMinute,
      analyticsPeriod: prefs.analyticsPeriod,
      monthlyBudget: prefs.monthlyBudget,
      preferencesUpdatedAt: prefs.updatedAt,
    });
  },
  markPreferencesReady: () => set({ preferencesReady: true }),
  resetPreferences: () =>
    set({
      ...DEFAULT_PREFERENCES,
      themeMode: readStoredThemeMode() as ThemeMode,
      preferencesReady: false,
    }),
}));
