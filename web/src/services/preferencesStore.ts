import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppPreferences, ThemeMode, StorageMode, RecordListPeriod, SyncedPreferences } from '@/models/types';
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
  storageMode: 'local',
  authGatewayComplete: false,
  lastCloudSyncAt: null,
  preferencesUpdatedAt: 0,
};

function touchPrefs(): number {
  return Date.now();
}

interface PreferencesStore extends AppPreferences {
  setCurrency: (currency: string) => void;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  completeOnboarding: () => void;
  setDailyReminder: (enabled: boolean) => void;
  setReminderTime: (hour: number, minute: number) => void;
  setAnalyticsPeriod: (key: string) => void;
  setMonthlyBudget: (amount: number | null) => void;
  setStorageMode: (mode: StorageMode) => void;
  completeAuthGateway: () => void;
  resetAuthGateway: () => void;
  setLastCloudSyncAt: (at: number | null) => void;
  applySyncedPreferences: (prefs: SyncedPreferences) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      setCurrency: (currency) => {
        set({ currency, preferencesUpdatedAt: touchPrefs() });
      },
      setLocale: (locale) => {
        set({ locale, preferencesUpdatedAt: touchPrefs() });
      },
      setThemeMode: (themeMode) => {
        set({ themeMode, preferencesUpdatedAt: touchPrefs() });
      },
      completeOnboarding: () => set({ onboardingComplete: true }),
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
      setStorageMode: (storageMode) => set({ storageMode }),
      completeAuthGateway: () => set({ authGatewayComplete: true }),
      resetAuthGateway: () => set({ authGatewayComplete: false, storageMode: 'local' }),
      setLastCloudSyncAt: (lastCloudSyncAt) => set({ lastCloudSyncAt }),
      applySyncedPreferences: (prefs) => set({
        currency: prefs.currency,
        locale: prefs.locale,
        themeMode: prefs.themeMode,
        dailyReminder: prefs.dailyReminder,
        reminderHour: prefs.reminderHour,
        reminderMinute: prefs.reminderMinute,
        analyticsPeriod: prefs.analyticsPeriod,
        monthlyBudget: prefs.monthlyBudget,
        preferencesUpdatedAt: prefs.updatedAt,
      }),
    }),
    { name: 'ausgegeben-preferences' },
  ),
);

export function useListPeriod(): RecordListPeriod {
  return 'this_month';
}
