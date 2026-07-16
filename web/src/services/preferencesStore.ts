import { create } from 'zustand';
import type { AppPreferences, ThemeMode, SyncedPreferences } from '@/models/types';
import type { Locale } from '@/i18n';

const DEFAULT_PREFERENCES: AppPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
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
    set({ themeMode, preferencesUpdatedAt: touchPrefs() });
  },
  completeOnboarding: () =>
    set({ onboardingComplete: true, preferencesUpdatedAt: touchPrefs() }),
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
  applySyncedPreferences: (prefs) =>
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
    }),
  markPreferencesReady: () => set({ preferencesReady: true }),
  resetPreferences: () => set({ ...DEFAULT_PREFERENCES, preferencesReady: false }),
}));

export function useListPeriod(): string {
  return 'this_month';
}
