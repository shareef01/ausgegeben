import { t } from '@/i18n';
import { usePreferencesStore } from '@/services/preferencesStore';
import {
  PERIODIC_SYNC_TAG,
  REMINDER_CACHE_NAME,
  REMINDER_CONFIG_URL,
  type SwReminderConfig,
} from '@/shared/reminderConfig';
import { dayKey, saveReminderConfig } from '@/sw/reminderCheck';

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
    unregister: (tag: string) => Promise<void>;
  };
};

export async function readReminderConfig(): Promise<SwReminderConfig | null> {
  try {
    const cache = await caches.open(REMINDER_CACHE_NAME);
    const response = await cache.match(REMINDER_CONFIG_URL);
    if (!response) return null;
    return response.json() as Promise<SwReminderConfig>;
  } catch {
    return null;
  }
}

async function registerPeriodicReminder(
  registration: ServiceWorkerRegistration,
  enabled: boolean,
): Promise<void> {
  const reg = registration as PeriodicSyncRegistration;
  if (!reg.periodicSync) return;

  try {
    if (!enabled) {
      await reg.periodicSync.unregister(PERIODIC_SYNC_TAG);
      return;
    }
    await reg.periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: 12 * 60 * 60 * 1000,
    });
  } catch (error) {
    console.warn('[reminder] Periodic background sync unavailable', error);
  }
}

export async function syncReminderConfigToServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const state = usePreferencesStore.getState();
  const existing = await readReminderConfig();
  const config: SwReminderConfig = {
    dailyReminder: state.dailyReminder,
    reminderHour: state.reminderHour,
    reminderMinute: state.reminderMinute,
    title: t('notificationReminderTitle'),
    body: t('notificationReminderBody'),
    lastNotifiedDay: existing?.lastNotifiedDay,
  };

  await saveReminderConfig(config);

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'REMINDER_CONFIG_UPDATED' });
    await registerPeriodicReminder(registration, config.dailyReminder);
  } catch (error) {
    console.warn('[reminder] Failed to sync config to service worker', error);
  }
}

export async function markReminderNotifiedToday(): Promise<void> {
  const existing = await readReminderConfig();
  if (!existing) return;
  await saveReminderConfig({ ...existing, lastNotifiedDay: dayKey() });
}
