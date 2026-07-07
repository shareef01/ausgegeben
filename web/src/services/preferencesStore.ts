import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppPreferences, ThemeMode, StorageMode, RecordListPeriod, SyncedPreferences } from '@/models/types';
import type { Locale } from '@/i18n';
import { applyThemeMode } from '@/theme/tokens';

const DEFAULT_PREFERENCES: AppPreferences = {
  currency: 'EUR',
  locale: 'en',
  themeMode: 'system',
  onboardingComplete: false,
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  analyticsPeriod: 'this_month',
  recordListPeriod: 'this_month',
  monthlyBudget: null,
  storageMode: 'local',
  authGatewayComplete: false,
  lastCloudSyncAt: null,
  preferencesUpdatedAt: 0,
  pendingExpenseDeleteCloudIds: [],
  pendingCategoryDeleteCloudIds: [],
  lastCloudUserId: null,
};

function touchPrefs(): number {
  return Date.now();
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeFromPrefs(themeMode: ThemeMode): void {
  applyThemeMode(themeMode, systemPrefersDark());
}

function pushPrefsIfCloud(): void {
  void import('@/services/syncService').then(({ syncService }) => syncService.pushPreferences());
}

interface PreferencesStore extends AppPreferences {
  deferredInstallPrompt: any;
  setCurrency: (currency: string) => void;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  completeOnboarding: () => void;
  setDailyReminder: (enabled: boolean) => void;
  setReminderTime: (hour: number, minute: number) => void;
  setAnalyticsPeriod: (key: string) => void;
  setRecordListPeriod: (period: RecordListPeriod) => void;
  setMonthlyBudget: (amount: number | null) => void;
  setStorageMode: (mode: StorageMode) => void;
  setDeferredInstallPrompt: (prompt: any) => void;
  completeAuthGateway: () => void;
  resetAuthGateway: () => void;
  setLastCloudSyncAt: (at: number | null) => void;
  setLastCloudUserId: (uid: string | null) => void;
  addPendingExpenseDelete: (cloudId: string) => void;
  removePendingExpenseDelete: (cloudId: string) => void;
  addPendingCategoryDelete: (cloudId: string) => void;
  removePendingCategoryDelete: (cloudId: string) => void;
  applySyncedPreferences: (prefs: SyncedPreferences) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      deferredInstallPrompt: null,
      setCurrency: (currency) => {
        set({ currency, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setLocale: (locale) => {
        set({ locale, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setThemeMode: (themeMode) => {
        set({ themeMode, preferencesUpdatedAt: touchPrefs() });
        applyThemeFromPrefs(themeMode);
        pushPrefsIfCloud();
      },
      completeOnboarding: () => set({ onboardingComplete: true }),
      setDailyReminder: (dailyReminder) => {
        set({ dailyReminder, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setReminderTime: (reminderHour, reminderMinute) => {
        set({ reminderHour, reminderMinute, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setAnalyticsPeriod: (analyticsPeriod) => {
        set({ analyticsPeriod, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setRecordListPeriod: (recordListPeriod) => {
        set({ recordListPeriod, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setMonthlyBudget: (monthlyBudget) => {
        set({ monthlyBudget, preferencesUpdatedAt: touchPrefs() });
        pushPrefsIfCloud();
      },
      setStorageMode: (storageMode) => set({ storageMode }),
      setDeferredInstallPrompt: (deferredInstallPrompt) => set({ deferredInstallPrompt }),
      completeAuthGateway: () => set({ authGatewayComplete: true }),
      resetAuthGateway: () => set({ authGatewayComplete: false, storageMode: 'local' }),
      setLastCloudSyncAt: (lastCloudSyncAt) => set({ lastCloudSyncAt }),
      setLastCloudUserId: (lastCloudUserId) => set({ lastCloudUserId }),
      addPendingExpenseDelete: (cloudId) => set((state) => ({
        pendingExpenseDeleteCloudIds: [...new Set([...state.pendingExpenseDeleteCloudIds, cloudId])],
      })),
      removePendingExpenseDelete: (cloudId) => set((state) => ({
        pendingExpenseDeleteCloudIds: state.pendingExpenseDeleteCloudIds.filter((id) => id !== cloudId),
      })),
      addPendingCategoryDelete: (cloudId) => set((state) => ({
        pendingCategoryDeleteCloudIds: [...new Set([...state.pendingCategoryDeleteCloudIds, cloudId])],
      })),
      removePendingCategoryDelete: (cloudId) => set((state) => ({
        pendingCategoryDeleteCloudIds: state.pendingCategoryDeleteCloudIds.filter((id) => id !== cloudId),
      })),
      applySyncedPreferences: (prefs) => {
        set({
          currency: prefs.currency,
          locale: prefs.locale,
          themeMode: prefs.themeMode,
          dailyReminder: prefs.dailyReminder,
          reminderHour: prefs.reminderHour,
          reminderMinute: prefs.reminderMinute,
          analyticsPeriod: prefs.analyticsPeriod,
          recordListPeriod: prefs.recordListPeriod,
          monthlyBudget: prefs.monthlyBudget,
          preferencesUpdatedAt: prefs.updatedAt,
        });
        applyThemeFromPrefs(prefs.themeMode);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = prefs.locale;
        }
      },
    }),
    {
      name: 'ausgegeben-preferences',
      partialize: (state) => {
        const { deferredInstallPrompt, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyThemeFromPrefs(state.themeMode);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = state.locale;
        }
      },
    },
  ),
);

export function useListPeriod(): RecordListPeriod {
  return usePreferencesStore((s) => s.recordListPeriod);
}
