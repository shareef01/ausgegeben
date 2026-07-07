import type { SwReminderConfig } from '@/shared/reminderConfig';

const MS_DAY = 86_400_000;

export function localDayStartMillis(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isPastReminderTime(now: number, hour: number, minute: number): boolean {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  return now >= target.getTime();
}

export function shouldNotify(
  config: SwReminderConfig,
  expenseCountToday: number,
  now = Date.now(),
): boolean {
  if (!config.dailyReminder) return false;
  if (!isPastReminderTime(now, config.reminderHour, config.reminderMinute)) return false;
  if (config.lastNotifiedDay === dayKey(now)) return false;
  return expenseCountToday === 0;
}

export function countExpensesInRange(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ausgegeben');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('expenses')) {
        database.close();
        resolve(0);
        return;
      }
      const tx = database.transaction('expenses', 'readonly');
      const store = tx.objectStore('expenses');
      const index = store.indexNames.contains('dateMillis')
        ? store.index('dateMillis')
        : store;
      const range = IDBKeyRange.bound(start, end, false, true);
      let count = 0;
      const cursorReq = index.openCursor(range);
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const row = cursor.value as { transactionType?: string };
          if (row.transactionType === 'expense') count += 1;
          cursor.continue();
          return;
        }
        database.close();
        resolve(count);
      };
    };
  });
}

export { MS_DAY };
