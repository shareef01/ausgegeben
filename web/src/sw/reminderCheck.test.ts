import { describe, expect, it } from 'vitest';
import {
  dayKey,
  isPastReminderTime,
  shouldNotify,
} from '@/sw/reminderLogic';
import type { SwReminderConfig } from '@/shared/reminderConfig';

const baseConfig: SwReminderConfig = {
  dailyReminder: true,
  reminderHour: 19,
  reminderMinute: 0,
  title: 'title',
  body: 'body',
};

describe('isPastReminderTime', () => {
  it('is false before reminder time', () => {
    const afternoon = new Date(2026, 5, 10, 15, 0).getTime();
    expect(isPastReminderTime(afternoon, 19, 0)).toBe(false);
  });

  it('is true after reminder time', () => {
    const evening = new Date(2026, 5, 10, 20, 0).getTime();
    expect(isPastReminderTime(evening, 19, 0)).toBe(true);
  });
});

describe('shouldNotify', () => {
  it('notifies when past reminder time and no expenses today', () => {
    const evening = new Date(2026, 5, 10, 20, 0).getTime();
    expect(shouldNotify(baseConfig, 0, evening)).toBe(true);
  });

  it('skips when already notified today', () => {
    const evening = new Date(2026, 5, 10, 20, 0).getTime();
    const config = { ...baseConfig, lastNotifiedDay: dayKey(evening) };
    expect(shouldNotify(config, 0, evening)).toBe(false);
  });

  it('skips when expenses exist today', () => {
    const evening = new Date(2026, 5, 10, 20, 0).getTime();
    expect(shouldNotify(baseConfig, 2, evening)).toBe(false);
  });

  it('skips when reminders disabled', () => {
    const evening = new Date(2026, 5, 10, 20, 0).getTime();
    expect(shouldNotify({ ...baseConfig, dailyReminder: false }, 0, evening)).toBe(false);
  });
});
