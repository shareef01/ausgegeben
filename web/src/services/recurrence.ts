import type { TransactionType } from '@/models/types';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface RecurringTemplate {
  id: string; amount: number; categoryId: string; note: string; transactionType: TransactionType;
  frequency: Frequency; interval: number; startDate: string; endDate: string | null; timeZone: string;
  enabled: boolean; nextIndex: number; nextDate: string | null; createdAt: number; updatedAt: number;
}
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_OCCURRENCES_PER_PASS = 20;
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let value = formatters.get(zone);
  if (!value) { value = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }); formatters.set(zone, value); }
  return value;
}
export function localDateAt(millis: number, zone: string): string {
  const parts = formatter(zone).formatToParts(millis);
  const field = (type: string) => parts.find(p => p.type === type)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
export function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function occurrenceDate(t: Pick<RecurringTemplate, 'startDate' | 'frequency' | 'interval' | 'endDate' | 'timeZone'>, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 40000 || !validDate(t.startDate) || !Number.isInteger(t.interval) || t.interval < 1 || t.interval > 365) return null;
  const [year, month, day] = t.startDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (t.frequency === 'daily' || t.frequency === 'weekly') date.setUTCDate(day + index * t.interval * (t.frequency === 'weekly' ? 7 : 1));
  else {
    const months = (t.frequency === 'yearly' ? 12 : 1) * index * t.interval;
    date.setUTCDate(1); date.setUTCMonth(month - 1 + months);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  if (!Number.isFinite(date.getTime())) return null;
  const result = date.toISOString().slice(0, 10);
  if (!validDate(result) || t.endDate && result > t.endDate) return null;
  const millis = occurrenceMillis(result, t.timeZone);
  return millis >= 946684800000 && millis < 4102444800000 ? result : null;
}
/** First occurrence strictly after this local day; anchored arithmetic avoids scanning history. */
export function indexAfter(t: RecurringTemplate, day: string): number {
  const a = t.startDate.split('-').map(Number), b = day.split('-').map(Number);
  let units = t.frequency === 'yearly' ? b[0] - a[0] : t.frequency === 'monthly' ? (b[0] - a[0]) * 12 + b[1] - a[1]
    : (Date.parse(day + 'T00:00:00Z') - Date.parse(t.startDate + 'T00:00:00Z')) / 86400000 / (t.frequency === 'weekly' ? 7 : 1);
  units = Math.max(0, Math.floor(units / t.interval));
  while (occurrenceDate(t, units) != null && occurrenceDate(t, units)! <= day) units++;
  return units;
}
/** Earliest instant of the local day, including midnight gaps and skipped calendar dates. */
export function occurrenceMillis(date: string, zone: string): number {
  const utc = Date.parse(date + 'T00:00:00Z');
  let low = utc - 36 * 3600000, high = low;
  while (localDateAt(high, zone) < date) { low = high; high += 3600000; }
  while (high - low > 1) { const mid = Math.floor((high + low) / 2); if (localDateAt(mid, zone) < date) low = mid; else high = mid; }
  return high;
}
export function occurrenceKey(id: string, date: string): string {
  if (!UUID_PATTERN.test(id) || !validDate(date)) throw new Error('INVALID_OCCURRENCE');
  return JSON.stringify(['recurring-v1', id, date]);
}
export function receiptId(id: string, date: string): string { occurrenceKey(id, date); return id + '_' + date; }
export function validTemplate(t: RecurringTemplate): boolean {
  try {
    if (typeof t.timeZone !== 'string' || t.timeZone.length > 100 || !t.timeZone) return false;
    formatter(t.timeZone);
    return UUID_PATTERN.test(t.id) && typeof t.note === 'string' && t.note.length <= 2000 && typeof t.categoryId === 'string' && t.categoryId.length > 0 && t.categoryId.length < 64 && !t.categoryId.includes('/')
      && ['expense', 'income', 'transfer'].includes(t.transactionType) && ['daily', 'weekly', 'monthly', 'yearly'].includes(t.frequency)
      && Number.isFinite(t.amount) && t.amount > 0 && t.amount < 1e9 && Math.abs(t.amount * 100 - Math.round(t.amount * 100)) < .0001
      && occurrenceMillis(t.startDate, t.timeZone) >= 946684800000 && occurrenceMillis(t.startDate, t.timeZone) < 4102444800000
      && Number.isInteger(t.interval) && t.interval >= 1 && t.interval <= 365 && validDate(t.startDate) && (t.endDate === null || validDate(t.endDate) && t.endDate >= t.startDate)
      && typeof t.enabled === 'boolean' && Number.isInteger(t.nextIndex) && t.nextIndex >= 0 && t.nextIndex <= 40000
      && t.nextDate === occurrenceDate(t, t.nextIndex) && Number.isSafeInteger(t.createdAt) && t.createdAt > 0 && Number.isSafeInteger(t.updatedAt) && t.updatedAt >= t.createdAt;
  } catch { return false; }
}

/** Bounded pure catch-up plan. Storage must recheck this against the current template. */
export function dueDates(t: RecurringTemplate, now: number, limit = MAX_OCCURRENCES_PER_PASS): string[] {
  if (!validTemplate(t) || !t.enabled) return [];
  const today = localDateAt(now, t.timeZone), dates: string[] = [];
  for (let index = t.nextIndex; dates.length < Math.min(MAX_OCCURRENCES_PER_PASS, Math.max(0, limit)); index++) {
    const date = occurrenceDate(t, index);
    if (date === null || date > today) break;
    dates.push(date);
  }
  return dates;
}
