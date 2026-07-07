import { expenseRepository } from '@/repositories/expenseRepository';
import { t } from '@/i18n';
import { usePreferencesStore } from '@/services/preferencesStore';
import { localDayStartMillis } from '@/utils/periodUtils';
import { markReminderNotifiedToday, readReminderConfig, syncReminderConfigToServiceWorker } from '@/services/reminderSWBridge';
import { shouldNotify } from '@/sw/reminderLogic';
import { NOTIFICATION_TAG, type SwReminderConfig } from '@/shared/reminderConfig';
import { navigateToOpenAdd } from '@/shared/appIntents';

const MS_DAY = 86_400_000;
const MIN_DELAY_MS = 60_000;

let timeoutId: ReturnType<typeof setTimeout> | null = null;

function millisUntilNext(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return Math.max(target.getTime() - now.getTime(), MIN_DELAY_MS);
}

async function buildConfig(lastNotifiedDay?: string): Promise<SwReminderConfig> {
  const { dailyReminder, reminderHour, reminderMinute } = usePreferencesStore.getState();
  return {
    dailyReminder,
    reminderHour,
    reminderMinute,
    title: t('notificationReminderTitle'),
    body: t('notificationReminderBody'),
    lastNotifiedDay,
  };
}

async function showReminderNotification(config: SwReminderConfig): Promise<void> {
  const options: NotificationOptions = {
    body: config.body,
    tag: NOTIFICATION_TAG,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(config.title, options);
      return;
    } catch {
      // fall back to page notification
    }
  }

  const notification = new Notification(config.title, options);
  notification.onclick = () => {
    notification.close();
    navigateToOpenAdd();
  };
}

async function fireIfNeeded(): Promise<void> {
  const { dailyReminder } = usePreferencesStore.getState();
  if (!dailyReminder) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const start = localDayStartMillis();
  const items = await expenseRepository.getExpensesInRange(start, start + MS_DAY);
  const expenseCount = items.filter((e) => e.transactionType === 'expense').length;
  const existing = await readReminderConfig();
  const config = await buildConfig(existing?.lastNotifiedDay);
  if (!shouldNotify(config, expenseCount)) return;

  await showReminderNotification(config);
  await markReminderNotifiedToday();
}

function scheduleNext(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  const { dailyReminder, reminderHour, reminderMinute } = usePreferencesStore.getState();
  if (!dailyReminder) return;

  timeoutId = setTimeout(async () => {
    try {
      await fireIfNeeded();
    } catch (error) {
      console.warn('[reminder] Failed to evaluate daily reminder', error);
    } finally {
      scheduleNext();
    }
  }, millisUntilNext(reminderHour, reminderMinute));
}

export const reminderService = {
  refresh(): void {
    void syncReminderConfigToServiceWorker();
    scheduleNext();
  },

  stop(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  },

  /** Re-check when the tab becomes visible (covers missed timers while backgrounded). */
  async checkNow(): Promise<void> {
    try {
      await fireIfNeeded();
    } catch (error) {
      console.warn('[reminder] Visibility check failed', error);
    }
  },

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },
};
