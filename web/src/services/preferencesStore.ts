import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppPreferences, ThemeMode, StorageMode, RecordListPeriod } from '@/models/types';

const DEFAULT_PREFERENCES: AppPreferences = {
  currency: 'EUR',
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
};

interface PreferencesStore extends AppPreferences {
  setCurrency: (currency: string) => void;
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
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      setCurrency: (currency) => set({ currency }),
      setThemeMode: (themeMode) => set({ themeMode }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setDailyReminder: (dailyReminder) => set({ dailyReminder }),
      setReminderTime: (reminderHour, reminderMinute) => set({ reminderHour, reminderMinute }),
      setAnalyticsPeriod: (analyticsPeriod) => set({ analyticsPeriod }),
      setMonthlyBudget: (monthlyBudget) => set({ monthlyBudget }),
      setStorageMode: (storageMode) => set({ storageMode }),
      completeAuthGateway: () => set({ authGatewayComplete: true }),
      resetAuthGateway: () => set({ authGatewayComplete: false, storageMode: 'local' }),
      setLastCloudSyncAt: (lastCloudSyncAt) => set({ lastCloudSyncAt }),
    }),
    { name: 'ausgegeben-preferences' },
  ),
);

export function useListPeriod(): RecordListPeriod {
  return 'this_month';
}
