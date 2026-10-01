import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { sanitizeSyncedPreferences } from '@/services/preferencesSync';
import {
  CATEGORIES_COLLECTION,
  EXPENSES_COLLECTION,
  PREFERENCES_DOC,
  SETTINGS_COLLECTION,
} from '@/repositories/firestorePaths';
import {
  validateBackup,
  summarizeBackup,
  type AusgegebenBackup,
  type BackupSummary,
} from '@/services/backupFormat';
import type { SyncedPreferences, ThemeMode } from '@/models/types';

export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const RESTORE_BATCH_CHUNK_SIZE = 400; // Under Firestore 500-write batch limit

export interface RestoreResult {
  success: boolean;
  expensesRestored: number;
  categoriesRestored: number;
  preferencesRestored: boolean;
}

/**
 * Validates and parses a user-selected backup file before any Firestore writes are attempted.
 * Enforces file size bounds and Schema v1 validation rules.
 */
export async function readAndValidateBackupFile(
  file: File,
): Promise<{ backup: AusgegebenBackup; summary: BackupSummary }> {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('BACKUP_FILE_TOO_LARGE');
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('BACKUP_READ_ERROR');
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }

  const validation = validateBackup(json);
  if (!validation.valid) {
    throw new Error(`VALIDATION_FAILED: ${validation.errors.join('; ')}`);
  }

  return {
    backup: validation.backup,
    summary: summarizeBackup(validation.backup),
  };
}

/**
 * Safely restores backup data into the authenticated user's account using merge/upsert semantics.
 *
 * Guarantees:
 * 1. Bounded to expected authenticated UID (refuses if session changed).
 * 2. Writes categories before expenses (satisfying Firestore rules foreign-key constraint).
 * 3. Chunks writes into batches of <= 400 documents.
 * 4. Merges onto stable document IDs (repeat restore is idempotent and does not create duplicates).
 * 5. Updates preferences with monotonic timestamp and syncs local + cloud stores.
 */
export async function restoreBackup(
  backup: AusgegebenBackup,
  expectedUid: string,
): Promise<RestoreResult> {
  const user = useAuthStore.getState().user;
  if (!user || user.uid !== expectedUid) {
    throw new Error('AUTH_ACCOUNT_CHANGED');
  }
  if (!user.emailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  const db = getFirebaseFirestore();
  if (!db) {
    throw new Error('FIRESTORE_UNAVAILABLE');
  }

  // Pre-flight check: query existing categories to detect conflicting transactionType
  const catColRef = collection(db, 'users', expectedUid, CATEGORIES_COLLECTION);
  const existingCatsSnap = await getDocs(catColRef);
  const existingCatsById = new Map<string, Record<string, unknown>>(
    existingCatsSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
  );

  for (const c of backup.categories) {
    const existing = existingCatsById.get(c.id);
    if (existing && existing.transactionType && existing.transactionType !== c.transactionType) {
      throw new Error(`CATEGORY_TYPE_CONFLICT: ${c.name}`);
    }
  }

  // 1. Write categories in chunks of RESTORE_BATCH_CHUNK_SIZE
  for (let i = 0; i < backup.categories.length; i += RESTORE_BATCH_CHUNK_SIZE) {
    const chunk = backup.categories.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const c of chunk) {
      const ref = doc(db, 'users', expectedUid, CATEGORIES_COLLECTION, c.id);
      batch.set(
        ref,
        {
          name: c.name.trim().slice(0, 50),
          iconName: c.iconName.slice(0, 50),
          colorInt: c.colorInt | 0,
          transactionType: c.transactionType,
          sortOrder: Math.max(0, Math.trunc(c.sortOrder)),
          updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
          id: c.id,
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // 2. Write expenses in chunks of RESTORE_BATCH_CHUNK_SIZE
  for (let i = 0; i < backup.expenses.length; i += RESTORE_BATCH_CHUNK_SIZE) {
    const chunk = backup.expenses.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const e of chunk) {
      const ref = doc(db, 'users', expectedUid, EXPENSES_COLLECTION, e.id);
      batch.set(
        ref,
        {
          amount: Math.round(e.amount * 100) / 100,
          dateMillis: Math.trunc(e.dateMillis),
          categoryId: e.categoryId,
          note: (e.note ?? '').slice(0, 200),
          transactionType: e.transactionType,
          updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now(),
          id: e.id,
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // 3. Restore preferences
  const currentPrefs = usePreferencesStore.getState();
  const newTimestamp = Math.max(Date.now(), (backup.preferences.preferencesUpdatedAt ?? 0) + 1);
  const synced: SyncedPreferences = sanitizeSyncedPreferences({
    currency: backup.preferences.currency,
    locale: backup.preferences.locale ?? currentPrefs.locale,
    themeMode: (backup.preferences.themeMode as ThemeMode) ?? currentPrefs.themeMode,
    onboardingComplete: true,
    dailyReminder: currentPrefs.dailyReminder,
    reminderHour: currentPrefs.reminderHour,
    reminderMinute: currentPrefs.reminderMinute,
    analyticsPeriod: currentPrefs.analyticsPeriod,
    monthlyBudget: backup.preferences.monthlyBudget,
    updatedAt: newTimestamp,
  });

  const prefRef = doc(db, 'users', expectedUid, SETTINGS_COLLECTION, PREFERENCES_DOC);
  await setDoc(prefRef, synced, { merge: true });
  usePreferencesStore.getState().applySyncedPreferences(synced);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ausgegeben:data-changed'));
  }

  return {
    success: true,
    expensesRestored: backup.expenses.length,
    categoriesRestored: backup.categories.length,
    preferencesRestored: true,
  };
}
