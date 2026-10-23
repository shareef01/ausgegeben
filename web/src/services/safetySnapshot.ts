import type { Category, Expense, SyncedPreferences, TransactionType } from '@/models/types';
import type { CategoryBudget } from '@/services/categoryBudgets';
import {
  occurrenceDate,
  occurrenceMillis,
  UUID_PATTERN,
  validDate,
  type RecurringTemplate,
} from '@/services/recurrence';
import type { OccurrenceReceipt } from '@/services/recurringBackupSection';

/**
 * Strict reader for the `restoreSnapshot` payload (AUD-006).
 *
 * The safety snapshot is the only recovery path for a replace restore, and rollback writes it
 * back as the authoritative state: `replaceRecurringCollection` deletes every template that is
 * not in the list it is handed, and the rollback deletes the expenses the snapshot does not
 * contain. A row this reader *silently* drops or defaults is therefore destructive, not merely
 * lossy. Before this module existed, `readSafetySnapshot` cast whole arrays with `as Expense[]`
 * (no per-field validation at all), read `metaData.categories ?? []` — i.e. a missing or
 * mistyped array became "the account had no categories" — and iterated an unvalidated
 * `metaData.chunkCount`, so a missing count silently yielded zero expenses.
 *
 * Everything here is fail-closed: the first malformed field throws
 * [InvalidSnapshotError] naming its path, and the caller leaves the journal at
 * `FAILED_RECOVERABLE` with the snapshot documents untouched (`rollbackReplace` rethrows before
 * the snapshot is deleted). Nothing is defaulted or skipped silently.
 *
 * Two deliberate leniencies, because refusing them would block recovery for exactly the legacy
 * accounts the rules tolerate:
 *
 *  - values the *writer* itself produces are accepted — `amount: 0`, `dateMillis: 0` and
 *    `categoryId: '0'` are what the web client records for an unreadable legacy row;
 *  - fields the clients already truncate on write (`name` → 80, `iconName` → 63, `note` →
 *    2000) are accepted at length and truncated by the existing call site.
 *
 * Mirrors app/src/main/java/com/aus/ausgegeben/util/SafetySnapshot.kt — keep both in sync.
 */

/** Bound on chunk documents a snapshot may reference, so a corrupt count cannot loop. */
export const SNAPSHOT_MAX_CHUNKS = 500;
/** Writer chunk size is 100 expenses (both clients) and 250 receipts (Android). */
export const SNAPSHOT_MAX_ROWS_PER_CHUNK = 500;

const TRANSACTION_TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];
const LOCALES = ['en', 'de'];
const THEME_MODES = [
  'light', 'dark', 'system', 'amoled', 'midnight',
  'ocean', 'forest', 'sunset', 'lavender', 'soft_light',
];
const ANALYTICS_PERIODS = ['all_time', 'this_month', 'last_month'];
const MONTH_KEY = /^month:[0-9]{4}-(0[1-9]|1[0-2])$/;
const HEX_64 = /^[0-9a-f]{64}$/;

export class InvalidSnapshotError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`SNAPSHOT_INVALID: ${path}: ${reason}`);
    this.name = 'InvalidSnapshotError';
    this.path = path;
    this.reason = reason;
  }
}

const fail = (path: string, reason: string): never => {
  throw new InvalidSnapshotError(path, reason);
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRow(value: unknown, path: string): Row {
  if (value === undefined || value === null) return fail(path, 'missing');
  if (!isRow(value)) return fail(path, `expected an object, got ${Array.isArray(value) ? 'array' : typeof value}`);
  return value;
}

function asRows(value: unknown, path: string): Row[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fail(path, `expected an array, got ${typeof value}`);
  if (value.length > SNAPSHOT_MAX_ROWS_PER_CHUNK) {
    return fail(path, `more than ${SNAPSHOT_MAX_ROWS_PER_CHUNK} rows`);
  }
  return value.map((element, index) => asRow(element, `${path}[${index}]`));
}

function text(source: Row, key: string, path: string, options?: { allowBlank?: boolean; max?: number }): string {
  const value = source[key];
  if (value === undefined || value === null) return fail(`${path}.${key}`, 'missing');
  if (typeof value !== 'string') return fail(`${path}.${key}`, `expected a string, got ${typeof value}`);
  if (!options?.allowBlank && value.trim() === '') return fail(`${path}.${key}`, 'blank');
  const max = options?.max ?? 2000;
  if (value.length > max) return fail(`${path}.${key}`, `longer than ${max} characters`);
  return value;
}

function num(source: Row, key: string, path: string): number {
  const value = source[key];
  if (value === undefined || value === null) return fail(`${path}.${key}`, 'missing');
  if (typeof value !== 'number') return fail(`${path}.${key}`, `expected a number, got ${typeof value}`);
  if (!Number.isFinite(value)) return fail(`${path}.${key}`, 'not finite');
  return value;
}

function whole(source: Row, key: string, path: string): number {
  const value = num(source, key, path);
  if (!Number.isInteger(value)) return fail(`${path}.${key}`, 'not an integer');
  return value;
}

function intIn(source: Row, key: string, path: string, min: number, max: number): number {
  const value = whole(source, key, path);
  if (value < min || value > max) return fail(`${path}.${key}`, `outside ${min}..${max}`);
  return value;
}

/**
 * A 32-bit signed integer, as `firestore.rules` requires of `colorInt`. Mirrors the Android
 * reader, which uses `Int`; without this the web reader accepted a colour the rules would reject
 * and handed it to a rollback write that could only fail. Found by the shared parity fixture.
 */
function int32(source: Row, key: string, path: string): number {
  const value = whole(source, key, path);
  if (value < -2_147_483_648 || value > 2_147_483_647) {
    return fail(`${path}.${key}`, 'outside 32-bit range');
  }
  return value;
}

function flag(source: Row, key: string, path: string, fallback: boolean): boolean {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') return fail(`${path}.${key}`, `expected a boolean, got ${typeof value}`);
  return value;
}

function choice(
  source: Row,
  key: string,
  path: string,
  allowed: readonly string[],
  fallback: string | null,
): string {
  const value = source[key];
  if (value === undefined || value === null) {
    if (fallback === null) return fail(`${path}.${key}`, 'missing');
    return fallback;
  }
  const parsed = text(source, key, path, { max: 64 });
  if (!allowed.includes(parsed)) return fail(`${path}.${key}`, `unsupported value "${parsed}"`);
  return parsed;
}

/** Declared chunk count, bounded so a corrupt value cannot drive an unbounded read loop. */
export function chunkCount(meta: Row, key: string, path = 'meta', fallback = 1): number {
  if (meta[key] === undefined || meta[key] === null) return fallback;
  const count = whole(meta, key, path);
  if (count < 0 || count > SNAPSHOT_MAX_CHUNKS) return fail(`${path}.${key}`, `outside 0..${SNAPSHOT_MAX_CHUNKS}`);
  return count;
}

export function operationId(meta: Row, path = 'meta'): string {
  return text(meta, 'operationId', path, { max: 64 });
}

export function categories(meta: Row, path = 'meta'): Category[] {
  return asRows(meta.categories, `${path}.categories`).map((rowValue, index) => {
    const rowPath = `${path}.categories[${index}]`;
    return {
      id: text(rowValue, 'id', rowPath, { max: 64 }),
      name: text(rowValue, 'name', rowPath, { max: 512 }),
      iconName: text(rowValue, 'iconName', rowPath, { allowBlank: true, max: 512 }) || 'shopping_bag',
      colorInt: int32(rowValue, 'colorInt', rowPath),
      transactionType: choice(rowValue, 'transactionType', rowPath, TRANSACTION_TYPES, 'expense'),
      sortOrder: intIn(rowValue, 'sortOrder', rowPath, 0, 9_999),
    } satisfies Category;
  });
}

export function expenses(container: Row, path: string): Expense[] {
  return asRows(container.expenses, `${path}.expenses`).map((rowValue, index) => {
    const rowPath = `${path}.expenses[${index}]`;
    const amount = num(rowValue, 'amount', rowPath);
    // 0 is what the writer records for an unreadable legacy row; a negative or over-cap
    // amount is not something any writer can produce.
    if (amount < 0 || amount >= 1_000_000_000) return fail(`${rowPath}.amount`, 'outside 0..1e9');
    const expense: Expense = {
      id: text(rowValue, 'id', rowPath, { max: 64 }),
      amount,
      dateMillis: whole(rowValue, 'dateMillis', rowPath),
      categoryId: text(rowValue, 'categoryId', rowPath, { max: 63 }),
      note: text(rowValue, 'note', rowPath, { allowBlank: true, max: 100_000 }),
      transactionType: choice(rowValue, 'transactionType', rowPath, TRANSACTION_TYPES, 'expense') as TransactionType,
    };
    if (rowValue.updatedAt !== undefined && rowValue.updatedAt !== null) {
      expense.updatedAt = whole(rowValue, 'updatedAt', rowPath);
    }
    if (rowValue.idempotencyKey !== undefined && rowValue.idempotencyKey !== null) {
      expense.idempotencyKey = text(rowValue, 'idempotencyKey', rowPath, { max: 128 });
    }
    if (rowValue.deleted !== undefined && rowValue.deleted !== null) {
      expense.deleted = flag(rowValue, 'deleted', rowPath, false);
    }
    if (rowValue.cloudId !== undefined && rowValue.cloudId !== null) {
      expense.cloudId = text(rowValue, 'cloudId', rowPath, { max: 128 });
    }
    if (rowValue.categoryCloudId !== undefined && rowValue.categoryCloudId !== null) {
      const raw = rowValue.categoryCloudId;
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        return fail(`${rowPath}.categoryCloudId`, `expected a string or number, got ${typeof raw}`);
      }
      expense.categoryCloudId = raw;
    }
    if (rowValue.receiptImagePath !== undefined && rowValue.receiptImagePath !== null) {
      expense.receiptImagePath = text(rowValue, 'receiptImagePath', rowPath, { max: 512 });
    }
    return expense;
  });
}

export function budgets(meta: Row, path = 'meta'): CategoryBudget[] | undefined {
  if (meta.categoryBudgets === undefined || meta.categoryBudgets === null) return undefined;
  return asRows(meta.categoryBudgets, `${path}.categoryBudgets`).map((rowValue, index) => {
    const rowPath = `${path}.categoryBudgets[${index}]`;
    const budget: CategoryBudget = {
      categoryId: text(rowValue, 'categoryId', rowPath, { max: 63 }),
      monthlyLimit: num(rowValue, 'monthlyLimit', rowPath),
      warningThresholdPercent: intIn(rowValue, 'warningThresholdPercent', rowPath, 1, 100),
      updatedAt: whole(rowValue, 'updatedAt', rowPath),
    };
    // Mirrors the rules, so a rollback write cannot be rejected half-way through.
    if (
      budget.monthlyLimit <= 0 ||
      budget.monthlyLimit >= 1_000_000_000 ||
      budget.updatedAt <= 0
    ) {
      return fail(rowPath, `budget for "${budget.categoryId}" is not writable`);
    }
    return budget;
  });
}

export function templates(meta: Row, path = 'meta'): RecurringTemplate[] | undefined {
  if (meta.recurringTemplates === undefined || meta.recurringTemplates === null) return undefined;
  // Dropping an invalid template here would delete it on rollback; refuse instead.
  return asRows(meta.recurringTemplates, `${path}.recurringTemplates`).map((rowValue, index) => {
    const rowPath = `${path}.recurringTemplates[${index}]`;
    const id = text(rowValue, 'id', rowPath, { max: 64 });
    const template = rowValue as unknown as RecurringTemplate;
    if (!isWritableTemplate(template)) return fail(rowPath, `template "${id}" is not writable`);
    return template;
  });
}

/**
 * Mirrors `RecurringTemplate.valid()` on Android, which is what decides whether the rollback can
 * write this row back at all. The earlier web version checked only types and ranges, so it accepted
 * a template whose `nextDate` disagreed with its `nextIndex` and one whose `startDate` was not a real
 * date — rows the rules refuse, which the rollback would then fail on half-way through the
 * collection. Found by the shared parity fixture (`testdata/safety-snapshot-parity.json`).
 */
function isWritableTemplate(template: RecurringTemplate): boolean {
  try {
    if (
      typeof template.id !== 'string' || !UUID_PATTERN.test(template.id) ||
      typeof template.amount !== 'number' || !Number.isFinite(template.amount) ||
      template.amount <= 0 || template.amount >= 1e9 ||
      Math.abs(template.amount * 100 - Math.round(template.amount * 100)) >= 0.0001 ||
      typeof template.categoryId !== 'string' || template.categoryId.length === 0 ||
      template.categoryId.length >= 64 || template.categoryId.includes('/') ||
      typeof template.note !== 'string' || template.note.length > 2000 ||
      !TRANSACTION_TYPES.includes(template.transactionType) ||
      !['daily', 'weekly', 'monthly', 'yearly'].includes(template.frequency) ||
      !Number.isInteger(template.interval) || template.interval < 1 || template.interval > 365 ||
      !validDate(template.startDate) ||
      typeof template.timeZone !== 'string' || template.timeZone.length === 0 || template.timeZone.length > 100 ||
      typeof template.enabled !== 'boolean' ||
      !Number.isInteger(template.nextIndex) || template.nextIndex < 0 || template.nextIndex > 40_000 ||
      !Number.isFinite(template.createdAt) || template.createdAt <= 0 ||
      !Number.isFinite(template.updatedAt) || template.updatedAt < template.createdAt
    ) {
      return false;
    }
    // Throws RangeError for an unknown zone, which the catch below turns into "not writable".
    const startMillis = occurrenceMillis(template.startDate, template.timeZone);
    if (!(startMillis >= 946_684_800_000 && startMillis < 4_102_444_800_000)) return false;
    if (template.endDate !== null) {
      if (!validDate(template.endDate) || template.endDate < template.startDate) return false;
    }
    return template.nextDate === occurrenceDate(template, template.nextIndex);
  } catch {
    return false;
  }
}

export function receipts(value: unknown, path: string): OccurrenceReceipt[] {
  return asRows(value, path).map((rowValue, index) => {
    const rowPath = `${path}[${index}]`;
    const id = text(rowValue, 'id', rowPath, { max: 256 });
    const templateId = text(rowValue, 'templateId', rowPath, { max: 64 });
    const scheduledDate = text(rowValue, 'scheduledDate', rowPath, { max: 32 });
    const expenseId = text(rowValue, 'expenseId', rowPath, { max: 64 });
    const createdAt = whole(rowValue, 'createdAt', rowPath);
    // Exactly the shape firestore.rules requires of an occurrence receipt.
    if (id !== `${templateId}_${scheduledDate}`) return fail(`${rowPath}.id`, 'does not encode template and date');
    if (!HEX_64.test(expenseId)) return fail(`${rowPath}.expenseId`, 'expected a lowercase SHA-256 hex id');
    if (createdAt <= 0) return fail(`${rowPath}.createdAt`, 'not positive');
    return { id, templateId, scheduledDate, expenseId, createdAt };
  });
}

export function preferences(meta: Row, path = 'meta'): SyncedPreferences | null {
  const raw = meta.preferences;
  if (raw === undefined || raw === null) return null;
  const prefs = asRow(raw, `${path}.preferences`);
  const prefsPath = `${path}.preferences`;
  if (Object.keys(prefs).length === 0) return null;

  const monthlyBudget = prefs.monthlyBudget === undefined || prefs.monthlyBudget === null
    ? null
    : num(prefs, 'monthlyBudget', prefsPath);
  if (monthlyBudget !== null && (monthlyBudget < 0 || monthlyBudget >= 1_000_000_000)) {
    return fail(`${prefsPath}.monthlyBudget`, 'outside 0..1e9');
  }
  let analyticsPeriod = 'this_month';
  if (prefs.analyticsPeriod !== undefined && prefs.analyticsPeriod !== null) {
    const parsed = text(prefs, 'analyticsPeriod', prefsPath, { max: 64 });
    if (!ANALYTICS_PERIODS.includes(parsed) && !MONTH_KEY.test(parsed)) {
      return fail(`${prefsPath}.analyticsPeriod`, `unsupported value "${parsed}"`);
    }
    analyticsPeriod = parsed;
  }
  return {
    currency: choice(prefs, 'currency', prefsPath, CURRENCIES, 'EUR'),
    locale: choice(prefs, 'locale', prefsPath, LOCALES, 'en') as SyncedPreferences['locale'],
    themeMode: choice(prefs, 'themeMode', prefsPath, THEME_MODES, 'system') as SyncedPreferences['themeMode'],
    onboardingComplete: flag(prefs, 'onboardingComplete', prefsPath, true),
    dailyReminder: flag(prefs, 'dailyReminder', prefsPath, true),
    reminderHour: prefs.reminderHour === undefined || prefs.reminderHour === null
      ? 19
      : intIn(prefs, 'reminderHour', prefsPath, 0, 23),
    reminderMinute: prefs.reminderMinute === undefined || prefs.reminderMinute === null
      ? 0
      : intIn(prefs, 'reminderMinute', prefsPath, 0, 59),
    analyticsPeriod,
    monthlyBudget,
    updatedAt: prefs.updatedAt === undefined || prefs.updatedAt === null
      ? Date.now()
      : whole(prefs, 'updatedAt', prefsPath),
  };
}

/** Optional declared total, for callers that only want to forward it to [requireCount]. */
export function declaredCount(meta: Row, key: string, path = 'meta'): number | null {
  const value = meta[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${path}.${key}`, 'declared count is not a number');
  }
  return value;
}

/**
 * Cross-check a declared total against what was actually read.
 *
 * This is what turns "a chunk quietly yielded nothing" into a loud failure: the writer records
 * `totalExpenses`/`totalCategories`/`totalReceipts`, so a mismatch can only mean the payload was
 * truncated, corrupted, or read wrongly. An absent total is not checked.
 */
export function requireCount(declared: number | null, actual: number, path: string): void {
  if (declared === null) return;
  if (declared !== actual) {
    fail(path, `snapshot declares ${declared} rows but ${actual} were read`);
  }
}
