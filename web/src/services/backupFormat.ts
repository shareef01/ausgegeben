import { validCategoryBudget, type CategoryBudget } from '@/services/categoryBudgets';
import { parseRecurringSection, type RecurringBackupSection } from '@/services/recurringBackupSection';
import type { Category, Expense, TransactionType } from '@/models/types';

export const BACKUP_FORMAT_IDENTIFIER = 'ausgegeben-backup';
export const CURRENT_BACKUP_SCHEMA_VERSION = 3;

export interface BackupPreferences {
  currency: string;
  monthlyBudget: number | null;
  locale?: 'en' | 'de';
  themeMode?: string;
  preferencesUpdatedAt?: number;
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
    name: c.name.trim().slice(0, 50),
    iconName: c.iconName.slice(0, 50),
    colorInt: Math.trunc(c.colorInt),
    transactionType: (ALLOWED_TRANSACTION_TYPES.has(c.transactionType as TransactionType)
      ? c.transactionType
      : 'expense') as TransactionType,
    sortOrder: Math.trunc(c.sortOrder),
    ...(typeof c.updatedAt === 'number' ? { updatedAt: c.updatedAt } : {}),
  }));

  const cleanExpenses: BackupExpense[] = params.expenses
    .filter((e) => !e.deleted)
    .map((e) => ({
      id: e.id,
      amount: Math.round(e.amount * 100) / 100,
      dateMillis: Math.trunc(e.dateMillis),
      categoryId: e.categoryId,
      note: (e.note ?? '').slice(0, 200),
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
      ...(typeof params.preferences.preferencesUpdatedAt === 'number'
        ? { preferencesUpdatedAt: params.preferences.preferencesUpdatedAt }
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
    if (typeof prefs.currency !== 'string' || prefs.currency.length !== 3) {
      errors.push('preferences.currency must be a 3-character currency code');
    }
    if (
      prefs.monthlyBudget !== null &&
      prefs.monthlyBudget !== undefined &&
      (typeof prefs.monthlyBudget !== 'number' ||
        !Number.isFinite(prefs.monthlyBudget) ||
        prefs.monthlyBudget <= 0 ||
        prefs.monthlyBudget >= 1_000_000_000)
    ) {
      errors.push('preferences.monthlyBudget must be null or a positive number < 1,000,000,000');
    }
  }

  // Validate Categories
  const categoryIds = new Set<string>();
  if (!Array.isArray(root.categories)) {
    errors.push('categories must be an array');
  } else {
    root.categories.forEach((cat, index) => {
      if (typeof cat !== 'object' || cat === null || Array.isArray(cat)) {
        errors.push(`Category at index ${index} must be a JSON object`);
        return;
      }
      const c = cat as Record<string, unknown>;
      if (typeof c.id !== 'string' || c.id.trim().length === 0) {
        errors.push(`Category at index ${index} has missing or invalid id`);
      } else {
        if (categoryIds.has(c.id)) {
          errors.push(`Duplicate category id: "${c.id}"`);
        }
        categoryIds.add(c.id);
      }

      if (typeof c.name !== 'string' || c.name.trim().length === 0 || c.name.length > 50) {
        errors.push(`Category at index ${index} name must be between 1 and 50 characters`);
      }

      if (typeof c.iconName !== 'string' || c.iconName.length > 50) {
        errors.push(`Category at index ${index} iconName must be a string up to 50 characters`);
      }

      if (typeof c.colorInt !== 'number' || !Number.isFinite(c.colorInt)) {
        errors.push(`Category at index ${index} colorInt must be a finite number`);
      }

      if (typeof c.sortOrder !== 'number' || !Number.isFinite(c.sortOrder)) {
        errors.push(`Category at index ${index} sortOrder must be a finite number`);
      }

      if (typeof c.transactionType !== 'string' || !ALLOWED_TRANSACTION_TYPES.has(c.transactionType as TransactionType)) {
        errors.push(`Category at index ${index} has invalid transactionType: "${String(c.transactionType)}"`);
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
      if (typeof e.id !== 'string' || e.id.trim().length === 0) {
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

      if (typeof e.dateMillis !== 'number' || !Number.isFinite(e.dateMillis) || e.dateMillis <= 0) {
        errors.push(`Expense at index ${index} has invalid dateMillis`);
      }

      if (typeof e.categoryId !== 'string' || e.categoryId.trim().length === 0) {
        errors.push(`Expense at index ${index} has missing categoryId`);
      } else if (categoryIds.size > 0 && !categoryIds.has(e.categoryId)) {
        errors.push(`Expense at index ${index} references nonexistent categoryId "${e.categoryId}"`);
      }

      if (typeof e.note !== 'string' || e.note.length > 200) {
        errors.push(`Expense at index ${index} note must be a string up to 200 characters`);
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
