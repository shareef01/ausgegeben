import {
  NOTIFICATION_TAG,
  REMINDER_CACHE_NAME,
  REMINDER_CONFIG_URL,
  type SwReminderConfig,
} from '@/shared/reminderConfig';
import {
  MS_DAY,
  countExpensesInRange,
  dayKey,
  localDayStartMillis,
  shouldNotify,
} from '@/sw/reminderLogic';

export {
  countExpensesInRange,
  dayKey,
  isPastReminderTime,
  localDayStartMillis,
  shouldNotify,
} from '@/sw/reminderLogic';

export async function loadReminderConfig(): Promise<SwReminderConfig | null> {
  const cache = await caches.open(REMINDER_CACHE_NAME);
  const response = await cache.match(REMINDER_CONFIG_URL);
  if (!response) return null;
  return response.json() as Promise<SwReminderConfig>;
}

export async function saveReminderConfig(config: SwReminderConfig): Promise<void> {
  const cache = await caches.open(REMINDER_CACHE_NAME);
  await cache.put(
    REMINDER_CONFIG_URL,
    new Response(JSON.stringify(config), { headers: { 'Content-Type': 'application/json' } }),
  );
}

export async function runReminderCheck(
  registration: ServiceWorkerRegistration,
  now = Date.now(),
): Promise<void> {
  const config = await loadReminderConfig();
  if (!config?.dailyReminder) return;

  const start = localDayStartMillis(now);
  const expenseCount = await countExpensesInRange(start, start + MS_DAY);
  if (!shouldNotify(config, expenseCount, now)) return;

  await registration.showNotification(config.title, {
    body: config.body,
    tag: NOTIFICATION_TAG,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });

  await saveReminderConfig({ ...config, lastNotifiedDay: dayKey(now) });
}
