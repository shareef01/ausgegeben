export const REMINDER_CACHE_NAME = 'ausgegeben-reminder-v1';
export const REMINDER_CONFIG_URL = '/__ausgegeben/reminder-config';
export const PERIODIC_SYNC_TAG = 'daily-reminder';
export const NOTIFICATION_TAG = 'ausgegeben-daily-reminder';

export interface SwReminderConfig {
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  title: string;
  body: string;
  lastNotifiedDay?: string;
}
