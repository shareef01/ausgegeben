import { validCategoryBudget, type CategoryBudget } from '@/services/categoryBudgets';
import { parseRecurringSection, type RecurringBackupSection } from '@/services/recurringBackupSection';
import type { Category, Expense, TransactionType } from '@/models/types';
import { SUPPORTED_CURRENCIES } from '@/utils/currency';

export const BACKUP_FORMAT_IDENTIFIER = 'ausgegeben-backup';
export const CURRENT_BACKUP_SCHEMA_VERSION = 3;

export interface BackupPreferences {
  currency: string;
  monthlyBudget: number | null;
  locale?: 'en' | 'de';
  themeMode?: string;
  preferencesUpdatedAt?: number;
  dailyReminder?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
  analyticsPeriod?: string;
}

export interface BackupCategory {
  id: string;
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: TransactionType;
  sortOrder: number;
  updatedAt?: number;
}

export interface BackupExpense {
  id: string;
  amount: number;
  dateMillis: number;
  categoryId: string;
  note: string;
  transactionType: TransactionType;
  updatedAt?: number;
  idempotencyKey?: string;
}

export interface AusgegebenBackup {
  format: typeof BACKUP_FORMAT_IDENTIFIER;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  preferences: BackupPreferences;
  categories: BackupCategory[];
  expenses: BackupExpense[];
  categoryBudgets?: CategoryBudget[];
  recurring?: RecurringBackupSection;
}

export interface BackupSummary {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  expenseCount: number;
  categoryCount: number;
  currency: string;
  monthlyBudget: number | null;
}

export type ValidationResult =
  | { valid: true; backup: AusgegebenBackup }
  | { valid: false; errors: string[] };

export function summarizeBackup(backup: AusgegebenBackup): BackupSummary {
  return {
    schemaVersion: backup.schemaVersion,
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
    expenseCount: backup.expenses.length,
    categoryCount: backup.categories.length,
    currency: backup.preferences.currency,
    monthlyBudget: backup.preferences.monthlyBudget ?? null,
  };
}

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'format',
  'schemaVersion',
  'exportedAt',
  'appVersion',
  'preferences',
  'categories',
  'expenses',
  'categoryBudgets',
  'recurring',
]);

const ALLOWED_TRANSACTION_TYPES = new Set<TransactionType>(['expense', 'income', 'transfer']);
const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);

function isCentGranular(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-4;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Restore re-stamps preferences with a revision newer than both the clock and the file.
 * The file's value is capped a few minutes ahead because the rules refuse revisions more
 * than five minutes in the future; an uncapped one failed the final preferences write
 * after every category and transaction had already been written.
 */
export function restoredPreferencesRevision(backupRevision: number | undefined, now = Date.now()): number {
  return Math.max(now, Math.min((backupRevision ?? 0) + 1, now + 240_000));
}

/** Margin kept below the rules' five-minute future bound; see writablePreferencesRevision. */
export const PREFERENCES_RESTORE_LEAD_MS = 240_000;

/**
 * Revision a restore may write right now, or null when none exists yet (AUD-005).
 *
 * `restoredPreferencesRevision` only looks at the clock and the file, but the rules put two
 * bounds on the write: `updatedAt` must strictly exceed the revision already stored on
 * `settings/preferences`, and it must stay below `request.time + 300000`. The stored revision
 * can legitimately sit almost five minutes in the future — the rules allow it, and any device
 * whose clock ran fast produces it — so the file/clock-only value can be *older* than what is
 * stored and be rejected at the last step, after categories, expenses, budgets and recurring
 * data have all been written.
 *
 * The candidate is the greatest of now, file+1 and stored+1, capped at now +
 * PREFERENCES_RESTORE_LEAD_MS (the same margin `restoredPreferencesRevision` already relies
 * on). When even the cap cannot exceed the stored revision, nothing can be written until that
 * stored value ages out; the caller must then refuse *before its first write*.
 */
export function writablePreferencesRevision(
  backupRevision: number | undefined,
  storedRevision: number | null | undefined,
  now = Date.now(),
): number | null {
  const cap = now + PREFERENCES_RESTORE_LEAD_MS;
  // Clamp before adding, mirroring the Android implementation: a corrupt far-future revision
  // must be capped, not carried into the comparison.
  const candidateOf = (revision: number | null | undefined) => Math.min(revision ?? 0, cap - 1) + 1;
  const target = Math.max(now, candidateOf(backupRevision), candidateOf(storedRevision));
  return (storedRevision ?? 0) < target ? target : null;
}

/** Category revision for a restore write: the file's value, never later than now. */
export function restoredCategoryRevision(backupRevision: number | undefined, now = Date.now()): number {
  return typeof backupRevision === 'number' ? Math.min(backupRevision, now) : now;
}

/**
 * Serializes current state into a standardized, versioned backup object.
 * Guaranteed to omit sensitive tokens, journals, tombstones, and local transient state.
 */
export function createBackup(params: {
  preferences: BackupPreferences;
  categories: Category[];
  expenses: Expense[];
  appVersion: string;
  categoryBudgets?: CategoryBudget[];
  recurring?: RecurringBackupSection;
  schemaVersion?: number;
}): AusgegebenBackup {
  const schemaVersion = params.schemaVersion ?? CURRENT_BACKUP_SCHEMA_VERSION;
  const cleanCategories: BackupCategory[] = params.categories.map((c) => ({
    id: c.id,
    name: c.name.trim().slice(0, 80),
    iconName: c.iconName.slice(0, 63),
    colorInt: Math.trunc(c.colorInt),
    transactionType: (ALLOWED_TRANSACTION_TYPES.has(c.transactionType as TransactionType)
      ? c.transactionType
      : 'expense') as TransactionType,
    sortOrder: Math.trunc(c.sortOrder),
    // Only a value validateBackup accepts, so an export always re-imports.
    ...(isNonNegativeSafeInteger(c.updatedAt) ? { updatedAt: c.updatedAt } : {}),
  }));

  const cleanExpenses: BackupExpense[] = params.expenses
    .filter((e) => !e.deleted)
    .map((e) => ({
      id: e.id,
      amount: Math.round(e.amount * 100) / 100,
      dateMillis: Math.trunc(e.dateMillis),
      categoryId: e.categoryId,
      note: (e.note ?? '').slice(0, 2000),
      transactionType: (ALLOWED_TRANSACTION_TYPES.has(e.transactionType)
        ? e.transactionType
        : 'expense') as TransactionType,
      ...(typeof e.updatedAt === 'number' ? { updatedAt: e.updatedAt } : {}),
      ...(e.idempotencyKey ? { idempotencyKey: e.idempotencyKey.slice(0, 100) } : {}),
    }));

  const backup: AusgegebenBackup = {
    format: BACKUP_FORMAT_IDENTIFIER,
    schemaVersion,
    exportedAt: new Date().toISOString(),
    appVersion: params.appVersion,
    preferences: {
      currency: params.preferences.currency.toUpperCase().slice(0, 3),
      monthlyBudget:
        typeof params.preferences.monthlyBudget === 'number' &&
        Number.isFinite(params.preferences.monthlyBudget) &&
        params.preferences.monthlyBudget > 0
          ? Math.round(params.preferences.monthlyBudget * 100) / 100
          : null,
      locale: params.preferences.locale === 'de' ? 'de' : 'en',
      themeMode: params.preferences.themeMode ?? 'system',
      ...(isNonNegativeSafeInteger(params.preferences.preferencesUpdatedAt)
        ? { preferencesUpdatedAt: params.preferences.preferencesUpdatedAt }
        : {}),
      ...(params.preferences.dailyReminder !== undefined
        ? { dailyReminder: params.preferences.dailyReminder }
        : {}),
      ...(params.preferences.reminderHour !== undefined
        ? { reminderHour: params.preferences.reminderHour }
        : {}),
      ...(params.preferences.reminderMinute !== undefined
        ? { reminderMinute: params.preferences.reminderMinute }
        : {}),
      ...(params.preferences.analyticsPeriod !== undefined
        ? { analyticsPeriod: params.preferences.analyticsPeriod }
        : {}),
    },
    categories: cleanCategories,
    expenses: cleanExpenses,
  };

  if (schemaVersion >= 2) {
    backup.categoryBudgets = params.categoryBudgets ?? [];
  }
  if (schemaVersion >= 3) {
    backup.recurring = params.recurring ?? { templates: [], receipts: [] };
  }

  return backup;
}

/**
 * Validates untrusted imported JSON before any Firestore operations are initiated.
 * Rejects invalid format, schema mismatch, unauthorized top-level fields, non-finite amounts,
 * negative amounts, missing foreign keys, or duplicate IDs.
 */
export function validateBackup(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Backup root must be a non-null JSON object'] };
  }

  const root = data as Record<string, unknown>;

  // Check top-level keys
  for (const key of Object.keys(root)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`Unknown or prohibited top-level property: "${key}"`);
    }
  }

  if (root.format !== BACKUP_FORMAT_IDENTIFIER) {
    errors.push(`Invalid format identifier: expected "${BACKUP_FORMAT_IDENTIFIER}", got "${String(root.format)}"`);
  }

  if (root.schemaVersion !== 1 && root.schemaVersion !== 2 && root.schemaVersion !== 3) {
    errors.push(
      `Unsupported schema version: expected ${CURRENT_BACKUP_SCHEMA_VERSION}, got ${String(root.schemaVersion)}`,
    );
  }

  if (typeof root.exportedAt !== 'string' || Number.isNaN(Date.parse(root.exportedAt))) {
    errors.push('exportedAt must be a valid ISO date string');
  }

  if (typeof root.appVersion !== 'string' || root.appVersion.trim().length === 0) {
    errors.push('appVersion must be a non-empty string');
  }

  // Validate Preferences
  if (typeof root.preferences !== 'object' || root.preferences === null || Array.isArray(root.preferences)) {
    errors.push('preferences must be a JSON object');
  } else {
    const prefs = root.preferences as Record<string, unknown>;
    // Restore used to coerce anything outside the rules' allowlist to EUR, silently
    // relabelling every amount in the file. Refuse it here instead.
    if (typeof prefs.currency !== 'string' || !SUPPORTED_CURRENCY_SET.has(prefs.currency)) {
      errors.push(`preferences.currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}`);
    }
    if (
      prefs.monthlyBudget !== null &&
      prefs.monthlyBudget !== undefined &&
      (typeof prefs.monthlyBudget !== 'number' ||
        !Number.isFinite(prefs.monthlyBudget) ||
        prefs.monthlyBudget <= 0 ||
        prefs.monthlyBudget >= 1_000_000_000 ||
        !isCentGranular(prefs.monthlyBudget))
    ) {
      errors.push('preferences.monthlyBudget must be null or a positive cent amount < 1,000,000,000');
    }
    // Optional fields: older backups omit them, but a present value must have the type
    // every writer produces, so restore never has to guess.
    if (prefs.locale !== undefined && prefs.locale !== 'en' && prefs.locale !== 'de') {
      errors.push('preferences.locale must be "en" or "de" when present');
    }
    if (prefs.themeMode !== undefined && typeof prefs.themeMode !== 'string') {
      errors.push('preferences.themeMode must be a string when present');
    }
    if (prefs.preferencesUpdatedAt !== undefined && !isNonNegativeSafeInteger(prefs.preferencesUpdatedAt)) {
      errors.push('preferences.preferencesUpdatedAt must be a non-negative integer when present');
    }
    if (prefs.dailyReminder !== undefined && typeof prefs.dailyReminder !== 'boolean') {
      errors.push('preferences.dailyReminder must be a boolean when present');
    }
    if (prefs.reminderHour !== undefined && !isIntegerInRange(prefs.reminderHour, 0, 23)) {
      errors.push('preferences.reminderHour must be an integer 0-23 when present');
    }
    if (prefs.reminderMinute !== undefined && !isIntegerInRange(prefs.reminderMinute, 0, 59)) {
      errors.push('preferences.reminderMinute must be an integer 0-59 when present');
    }
    if (prefs.analyticsPeriod !== undefined && typeof prefs.analyticsPeriod !== 'string') {
      errors.push('preferences.analyticsPeriod must be a string when present');
    }
  }

  // Validate Categories
  const categoryIds = new Set<string>();
  const categoryMap = new Map<string, { transactionType: TransactionType }>();
  if (!Array.isArray(root.categories)) {
    errors.push('categories must be an array');
  } else {
    root.categories.forEach((cat, index) => {
      if (typeof cat !== 'object' || cat === null || Array.isArray(cat)) {
        errors.push(`Category at index ${index} must be a JSON object`);
        return;
      }
      const c = cat as Record<string, unknown>;
      if (typeof c.id !== 'string' || c.id.trim().length === 0 || c.id.length >= 64 || c.id.includes('/')) {
        errors.push(`Category at index ${index} has missing or invalid id`);
      } else {
        if (categoryIds.has(c.id)) {
          errors.push(`Duplicate category id: "${c.id}"`);
        }
        categoryIds.add(c.id);
      }

      if (typeof c.name !== 'string' || c.name.trim().length === 0 || c.name.length > 80) {
        errors.push(`Category at index ${index} name must be between 1 and 80 characters`);
      }

      if (typeof c.iconName !== 'string' || c.iconName.trim().length === 0 || c.iconName.length >= 64) {
        errors.push(`Category at index ${index} iconName must be a non-empty string under 64 characters`);
      }

      if (
        typeof c.colorInt !== 'number' ||
        !Number.isFinite(c.colorInt) ||
        c.colorInt < -2147483648 ||
        c.colorInt > 2147483647
      ) {
        errors.push(`Category at index ${index} colorInt must be a 32-bit integer`);
      }

      if (
        typeof c.sortOrder !== 'number' ||
        !Number.isFinite(c.sortOrder) ||
        c.sortOrder < 0 ||
        c.sortOrder >= 10000
      ) {
        errors.push(`Category at index ${index} sortOrder must be a finite number between 0 and 9999`);
      }

      // Restore writes this value back (capped at now), so it must be a plain millisecond
      // number. Zero is allowed: older exports carry it for categories that never had a clock.
      if (c.updatedAt !== undefined && !isNonNegativeSafeInteger(c.updatedAt)) {
        errors.push(`Category at index ${index} updatedAt must be a non-negative integer timestamp`);
      }

      if (typeof c.transactionType !== 'string' || !ALLOWED_TRANSACTION_TYPES.has(c.transactionType as TransactionType)) {
        errors.push(`Category at index ${index} has invalid transactionType: "${String(c.transactionType)}"`);
      } else if (typeof c.id === 'string' && c.id.trim().length > 0) {
        categoryMap.set(c.id, { transactionType: c.transactionType as TransactionType });
      }
    });
  }

  // Validate Expenses
  const expenseIds = new Set<string>();
  if (!Array.isArray(root.expenses)) {
    errors.push('expenses must be an array');
  } else {
    root.expenses.forEach((exp, index) => {
      if (typeof exp !== 'object' || exp === null || Array.isArray(exp)) {
        errors.push(`Expense at index ${index} must be a JSON object`);
        return;
      }
      const e = exp as Record<string, unknown>;
      if (typeof e.id !== 'string' || e.id.trim().length === 0 || e.id.length > 64 || e.id.includes('/')) {
        errors.push(`Expense at index ${index} has missing or invalid id`);
      } else {
        if (expenseIds.has(e.id)) {
          errors.push(`Duplicate expense id: "${e.id}"`);
        }
        expenseIds.add(e.id);
      }

      if (
        typeof e.amount !== 'number' ||
        !Number.isFinite(e.amount) ||
        e.amount <= 0 ||
        e.amount >= 1_000_000_000
      ) {
        errors.push(`Expense at index ${index} has invalid amount: must be positive finite number < 1,000,000,000`);
      } else {
        // Enforce cent precision (max 2 decimal places)
        const inCents = e.amount * 100;
        if (Math.abs(inCents - Math.round(inCents)) > 1e-4) {
          errors.push(`Expense at index ${index} has sub-cent precision: ${e.amount}`);
        }
      }

      if (
        typeof e.dateMillis !== 'number' ||
        !Number.isFinite(e.dateMillis) ||
        e.dateMillis < 946684800000 ||
        e.dateMillis >= 4102444800000
      ) {
        errors.push(`Expense at index ${index} has invalid dateMillis: must be between 2000-01-01 and 2100-01-01 UTC`);
      }

      if (typeof e.categoryId !== 'string' || e.categoryId.trim().length === 0 || e.categoryId.length >= 64 || e.categoryId.includes('/')) {
        errors.push(`Expense at index ${index} has missing or invalid categoryId`);
      } else if (!categoryIds.has(e.categoryId)) {
        // Every exporter writes the categories its expenses use (the rules refuse an
        // expense without its category, the "0" sentinel included), so a missing one
        // means a damaged or hand-made file. It used to pass whenever `categories` was
        // empty and then fail mid-restore, after earlier batches had committed.
        errors.push(`Expense at index ${index} references nonexistent categoryId "${e.categoryId}"`);
      } else if (categoryMap.has(e.categoryId)) {
        const cat = categoryMap.get(e.categoryId)!;
        if (e.categoryId !== '0' && cat.transactionType !== e.transactionType) {
          errors.push(`Expense at index ${index} transactionType "${String(e.transactionType)}" does not match category transactionType "${cat.transactionType}"`);
        }
      }

      if (typeof e.note !== 'string' || e.note.length > 2000) {
        errors.push(`Expense at index ${index} note must be a string up to 2000 characters`);
      }

      if (typeof e.transactionType !== 'string' || !ALLOWED_TRANSACTION_TYPES.has(e.transactionType as TransactionType)) {
        errors.push(`Expense at index ${index} has invalid transactionType: "${String(e.transactionType)}"`);
      }
    });
  }

  if (root.schemaVersion === 1) {
    if ('categoryBudgets' in root) errors.push('Schema v1 cannot contain categoryBudgets');
    if ('recurring' in root) errors.push('Schema v1 cannot contain recurring');
  }
  if (root.schemaVersion === 2) {
    if ('recurring' in root) errors.push('Schema v2 cannot contain recurring');
    const seen = new Set<string>();
    const expenseCategoryIds = new Set((Array.isArray(root.categories) ? root.categories as BackupCategory[] : []).filter(c => c && c.transactionType === 'expense').map(c => c.id));
    if (!Array.isArray(root.categoryBudgets)) errors.push('categoryBudgets must be an array');
    else for (const value of root.categoryBudgets) {
      const b = value as CategoryBudget;
      if (!b || typeof b !== 'object' || !validCategoryBudget(b) || Object.keys(b).some(k => !['categoryId','monthlyLimit','warningThresholdPercent','updatedAt'].includes(k))) { errors.push('Invalid category budget'); continue; }
      if (seen.has(b.categoryId)) errors.push('Duplicate category budget');
      seen.add(b.categoryId);
      if (!expenseCategoryIds.has(b.categoryId)) errors.push('Budget requires expense category');
    }
  }
  if (root.schemaVersion === 3) {
    const seen = new Set<string>();
    const expenseCategoryIds = new Set((Array.isArray(root.categories) ? root.categories as BackupCategory[] : []).filter(c => c && c.transactionType === 'expense').map(c => c.id));
    if (!Array.isArray(root.categoryBudgets)) errors.push('categoryBudgets must be an array');
    else for (const value of root.categoryBudgets) {
      const b = value as CategoryBudget;
      if (!b || typeof b !== 'object' || !validCategoryBudget(b) || Object.keys(b).some(k => !['categoryId','monthlyLimit','warningThresholdPercent','updatedAt'].includes(k))) { errors.push('Invalid category budget'); continue; }
      if (seen.has(b.categoryId)) errors.push('Duplicate category budget');
      seen.add(b.categoryId);
      if (!expenseCategoryIds.has(b.categoryId)) errors.push('Budget requires expense category');
    }

    if (!('recurring' in root)) {
      errors.push('Schema v3 must contain recurring');
    } else {
      try {
        const sec = parseRecurringSection(root.recurring);
        const catMap = new Map((Array.isArray(root.categories) ? root.categories as BackupCategory[] : []).map(c => [c.id, c]));
        for (const t of sec.templates) {
          const cat = catMap.get(t.categoryId);
          if (!cat) {
            errors.push(`Recurring template "${t.id}" references nonexistent category "${t.categoryId}"`);
          } else if (cat.transactionType !== t.transactionType) {
            errors.push(`Recurring template "${t.id}" type "${t.transactionType}" does not match category type "${cat.transactionType}"`);
          }
        }
      } catch (err) {
        errors.push(`Invalid recurring section: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, backup: root as unknown as AusgegebenBackup };
}
