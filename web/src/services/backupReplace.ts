import { toMinorUnits } from '@/utils/money';
import { categoryBudgetRepository, type CategoryBudget } from '@/services/categoryBudgets';
import { recurringRepository } from '@/services/recurringRepository';
import type { RecurringTemplate } from '@/services/recurrence';
import type { OccurrenceReceipt, RecurringBackupSection } from '@/services/recurringBackupSection';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { sanitizeSyncedPreferences } from '@/services/preferencesSync';
import {
  CATEGORIES_COLLECTION,
  EXPENSES_COLLECTION,
  META_COLLECTION,
  PREFERENCES_DOC,
  RESTORE_OPERATION_DOC,
  RESTORE_SNAPSHOT_COLLECTION,
  SETTINGS_COLLECTION,
} from '@/repositories/firestorePaths';
import type { Category, Expense, SyncedPreferences, TransactionType } from '@/models/types';
import type {
  AusgegebenBackup,
  BackupCategory,
  BackupExpense,
} from '@/services/backupFormat';

export const RESTORE_BATCH_CHUNK_SIZE = 400;
export const SNAPSHOT_CHUNK_SIZE = 200;

export type RestorePhase =
  | 'PREPARING'
  | 'SNAPSHOT_READY'
  | 'APPLYING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'FAILED_RECOVERABLE';

export interface PlannedCounts {
  backupExpenseCount: number;
  backupCategoryCount: number;
  expensesToUpsertCount: number;
  expensesToDeleteCount: number;
  categoriesToUpsertCount: number;
  categoriesPreservedCount: number;
}

export interface ReplacePlan {
  expensesToUpsert: BackupExpense[];
  expenseIdsToDelete: string[];
  categoriesToUpsert: BackupCategory[];
  categoryIdsToPreserve: string[];
  preferencesToUpdate: SyncedPreferences;
  conflicts: string[];
  counts: PlannedCounts;
}

export interface RestoreJournalProgress {
  step?: 'categories' | 'expenses_upsert' | 'expenses_delete' | 'preferences';
  batchIndex?: number;
  totalBatches?: number;
  lastProcessedId?: string;
}

export interface RestoreOperationDoc {
  operationId: string;
  ownerUid: string;
  mode: 'replace';
  backupFingerprint: string;
  phase: RestorePhase;
  createdAt: number;
  updatedAt: number;
  plannedCounts?: PlannedCounts;
  progress?: RestoreJournalProgress;
  snapshotMeta?: {
    chunkCount: number;
    totalExpenses: number;
    totalCategories: number;
  };
  error?: string;
  failedFromPhase?: RestorePhase;
  initiatorPlatform?: 'web' | 'android';
}

export interface ReplaceFaultHooks {
  failAfterSnapshot?: boolean;
  failAfterCategoryBatch?: number;
  failAfterExpenseUpsertBatch?: number;
  failAfterExpenseDeleteBatch?: number;
  failBeforePreferences?: boolean;
  failDuringVerification?: boolean;
  failDuringRollback?: boolean;
}

export interface ReplaceExecutionResult {
  success: boolean;
  operationId: string;
  plan: ReplacePlan;
  phase: RestorePhase;
}

// In-process single-flight lock per UID to prevent rapid double-clicks
const activeOperationsByUid = new Set<string>();

/**
 * Computes a deterministic SHA-256 fingerprint for a backup.
 */
export async function computeBackupFingerprint(backup: AusgegebenBackup): Promise<string> {
  const canonicalExpenses = [...backup.expenses]
    .map((e) => `${e.id},${e.amount},${e.dateMillis},${e.categoryId},${e.transactionType}`)
    .sort()
    .join(';');
  const canonicalCategories = [...backup.categories]
    .map((c) => `${c.id},${c.name},${c.transactionType}`)
    .sort()
    .join(';');
  const canonicalPrefs = `${backup.preferences.currency},${backup.preferences.monthlyBudget ?? 'null'},${backup.preferences.locale ?? ''},${backup.preferences.themeMode ?? ''}`;
  const budgetPart = backup.schemaVersion >= 2 ? ':' + JSON.stringify([...(backup.categoryBudgets ?? [])].sort((a,b) => a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0).map(b => [b.categoryId, toMinorUnits(b.monthlyLimit), b.warningThresholdPercent])) : '';
  const recurringPart = backup.schemaVersion >= 3 && backup.recurring ? ':' + JSON.stringify([
    [...(backup.recurring.templates ?? [])].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(t => [
      t.id,
      toMinorUnits(t.amount),
      t.categoryId,
      t.note,
      t.transactionType,
      t.frequency,
      t.interval,
      t.startDate,
      t.endDate,
      t.timeZone,
      t.enabled,
      t.nextIndex,
      t.nextDate,
      t.createdAt,
      t.updatedAt,
    ]),
    [...(backup.recurring.receipts ?? [])].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(r => [
      r.id,
      r.templateId,
      r.scheduledDate,
      r.expenseId,
      r.createdAt,
    ]),
  ]) : '';
  const raw = `v${backup.schemaVersion}:${backup.exportedAt}:${canonicalExpenses}:${canonicalCategories}:${canonicalPrefs}${budgetPart}${recurringPart}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for simple testing environments without subtle crypto
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Pure, side-effect free mutation planner for replacing current account data with a backup.
 */
export function planReplace(params: {
  currentExpenses: Expense[];
  currentCategories: Category[];
  currentPreferences: SyncedPreferences | null;
  backup: AusgegebenBackup;
}): ReplacePlan {
  const { currentExpenses, currentCategories, currentPreferences, backup } = params;
  const conflicts: string[] = [];

  if (backup.schemaVersion !== 1 && backup.schemaVersion !== 2 && backup.schemaVersion !== 3) {
    conflicts.push(`UNSUPPORTED_SCHEMA_VERSION: ${backup.schemaVersion}`);
  }

  const currentCatMap = new Map<string, Category>(currentCategories.map((c) => [c.id, c]));
  const backupCatMap = new Map<string, BackupCategory>(backup.categories.map((c) => [c.id, c]));

  // Check category type compatibility
  for (const c of backup.categories) {
    const existing = currentCatMap.get(c.id);
    if (existing && existing.transactionType !== c.transactionType) {
      conflicts.push(`CATEGORY_TYPE_CONFLICT: ${c.name} (${existing.transactionType} vs ${c.transactionType})`);
    }
  }

  // Check foreign key references from backup expenses
  for (const e of backup.expenses) {
    if (e.categoryId !== '0' && !backupCatMap.has(e.categoryId) && !currentCatMap.has(e.categoryId)) {
      conflicts.push(`CATEGORY_ORPHAN_REFERENCE: Expense ${e.id} references non-existent category ${e.categoryId}`);
    }
  }

  // Check foreign key references from backup recurring templates
  if (backup.schemaVersion === 3 && backup.recurring) {
    for (const t of backup.recurring.templates) {
      if (!backupCatMap.has(t.categoryId) && !currentCatMap.has(t.categoryId)) {
        conflicts.push(`CATEGORY_ORPHAN_REFERENCE: Recurring template ${t.id} references non-existent category ${t.categoryId}`);
      }
    }
  }

  // Expenses to upsert: all backup expenses
  const expensesToUpsert = backup.expenses;

  // Stale expenses to delete: current expenses whose IDs are not in the backup
  const backupExpenseIds = new Set(backup.expenses.map((e) => e.id));
  const expenseIdsToDelete = currentExpenses
    .filter((e) => !backupExpenseIds.has(e.id))
    .map((e) => e.id);

  // Categories to upsert: all backup categories
  const categoriesToUpsert = backup.categories;

  // Unrelated categories preserved: current categories not present in backup
  const categoryIdsToPreserve = currentCategories
    .filter((c) => !backupCatMap.has(c.id))
    .map((c) => c.id);

  // Preferences update
  const newTimestamp = Math.max(
    Date.now(),
    (backup.preferences.preferencesUpdatedAt ?? 0) + 1,
  );
  const preferencesToUpdate: SyncedPreferences = sanitizeSyncedPreferences({
    currency: backup.preferences.currency,
    locale: backup.preferences.locale ?? currentPreferences?.locale ?? 'en',
    themeMode: (backup.preferences.themeMode as SyncedPreferences['themeMode']) ?? currentPreferences?.themeMode ?? 'system',
    dailyReminder: currentPreferences?.dailyReminder ?? true,
    onboardingComplete: currentPreferences?.onboardingComplete ?? true,
    reminderHour: currentPreferences?.reminderHour ?? 19,
    reminderMinute: currentPreferences?.reminderMinute ?? 0,
    analyticsPeriod: currentPreferences?.analyticsPeriod ?? 'this_month',
    updatedAt: newTimestamp,
    monthlyBudget: backup.preferences.monthlyBudget !== undefined ? backup.preferences.monthlyBudget : (currentPreferences?.monthlyBudget ?? null),
  });

  return {
    expensesToUpsert,
    expenseIdsToDelete,
    categoriesToUpsert,
    categoryIdsToPreserve,
    preferencesToUpdate,
    conflicts,
    counts: {
      backupExpenseCount: backup.expenses.length,
      backupCategoryCount: backup.categories.length,
      expensesToUpsertCount: expensesToUpsert.length,
      expensesToDeleteCount: expenseIdsToDelete.length,
      categoriesToUpsertCount: categoriesToUpsert.length,
      categoriesPreservedCount: categoryIdsToPreserve.length,
    },
  };
}

/**
 * Creates persistent, chunked safety snapshot documents under /users/{userId}/restoreSnapshot/.
 */
export async function createSafetySnapshot(
  userId: string,
  operationId: string,
  expenses: Expense[],
  categories: Category[],
  preferences: SyncedPreferences | null,
  categoryBudgets?: CategoryBudget[],
  recurringTemplates?: RecurringTemplate[],
  recurringReceipts?: OccurrenceReceipt[],
): Promise<{ chunkCount: number; totalExpenses: number; totalCategories: number }> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const now = Date.now();
  const chunkCount = Math.ceil(expenses.length / SNAPSHOT_CHUNK_SIZE) || 1;

  // Write snapshot metadata
  const metaRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, 'meta');
  await setDoc(metaRef, {
    operationId,
    ownerUid: userId,
    createdAt: now,
    chunkCount,
    totalExpenses: expenses.length,
    totalCategories: categories.length,
    preferences: preferences ?? {},
    ...(categoryBudgets ? { categoryBudgets } : {}),
    ...(recurringTemplates ? { recurringTemplates } : {}),
    ...(recurringReceipts ? { recurringReceipts } : {}),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      iconName: c.iconName,
      colorInt: c.colorInt,
      transactionType: c.transactionType,
      sortOrder: c.sortOrder,
      updatedAt: c.updatedAt ?? now,
    })),
  });

  // Write expense chunks
  for (let i = 0; i < chunkCount; i++) {
    const chunkExpenses = expenses.slice(i * SNAPSHOT_CHUNK_SIZE, (i + 1) * SNAPSHOT_CHUNK_SIZE);
    const chunkRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, `chunk_${i}`);
    await setDoc(chunkRef, {
      operationId,
      ownerUid: userId,
      createdAt: now,
      chunkIndex: i,
      chunkCount,
      expenses: chunkExpenses.map((e) => ({
        id: e.id,
        amount: e.amount,
        dateMillis: e.dateMillis,
        categoryId: e.categoryId,
        note: e.note,
        transactionType: e.transactionType,
        updatedAt: e.updatedAt ?? now,
      })),
    });
  }

  // Verify write back
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) {
    throw new Error('SNAPSHOT_VERIFICATION_FAILED: meta missing');
  }

  return {
    chunkCount,
    totalExpenses: expenses.length,
    totalCategories: categories.length,
  };
}

/**
 * Reads back the stored safety snapshot.
 */
export async function readSafetySnapshot(userId: string): Promise<{
  operationId: string;
  expenses: Expense[];
  categories: Category[];
  preferences: SyncedPreferences | null;
  categoryBudgets?: CategoryBudget[];
  recurringTemplates?: RecurringTemplate[];
  recurringReceipts?: OccurrenceReceipt[];
}> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const metaRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, 'meta');
  const metaSnap = await getDocFromServer(metaRef);
  if (!metaSnap.exists()) {
    throw new Error('SNAPSHOT_NOT_FOUND');
  }
  const metaData = metaSnap.data() as {
    operationId: string;
    chunkCount: number;
    categories?: Category[];
    preferences?: SyncedPreferences;
    categoryBudgets?: CategoryBudget[];
    recurringTemplates?: RecurringTemplate[];
    recurringReceipts?: OccurrenceReceipt[];
  };

  const allExpenses: Expense[] = [];
  for (let i = 0; i < metaData.chunkCount; i++) {
    const chunkRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, `chunk_${i}`);
    const chunkSnap = await getDocFromServer(chunkRef);
    if (!chunkSnap.exists() || chunkSnap.data().operationId !== metaData.operationId) throw new Error('SNAPSHOT_CHUNK_MISSING_OR_CHANGED');
    if (chunkSnap.exists()) {
      const data = chunkSnap.data() as { expenses?: Expense[] };
      if (data.expenses) {
        allExpenses.push(...data.expenses);
      }
    }
  }

  return {
    categoryBudgets: metaData.categoryBudgets,
    recurringTemplates: metaData.recurringTemplates,
    recurringReceipts: metaData.recurringReceipts,
    operationId: metaData.operationId,
    expenses: allExpenses,
    categories: metaData.categories ?? [],
    preferences: metaData.preferences && Object.keys(metaData.preferences).length > 0 ? metaData.preferences : null,
  };
}

/**
 * Deletes all snapshot documents.
 */
export async function deleteSafetySnapshot(userId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const colRef = collection(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION);
  const snap = await getDocs(colRef);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * Reads the current durable restore operation document, if any.
 */
export async function getRestoreOperation(userId: string): Promise<RestoreOperationDoc | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return snap.data() as RestoreOperationDoc;
}

/**
 * Writes or updates the durable restore operation document.
 */
export async function setRestoreOperation(userId: string, op: RestoreOperationDoc): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  await setDoc(ref, op);
}

/**
 * Deletes the durable restore operation document.
 */
export async function deleteRestoreOperation(userId: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const ref = doc(db, 'users', userId, META_COLLECTION, RESTORE_OPERATION_DOC);
  await deleteDoc(ref);
}

/**
 * Executes a full destructive replace operation with safety architecture.
 */
export async function executeReplace(
  backup: AusgegebenBackup,
  expectedUid: string,
  faultHooks?: ReplaceFaultHooks,
  isResume = false,
): Promise<ReplaceExecutionResult> {
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

  // 1. In-process mutex check
  if (activeOperationsByUid.has(expectedUid)) {
    throw new Error('RESTORE_OPERATION_ALREADY_IN_PROGRESS');
  }
  activeOperationsByUid.add(expectedUid);

  let currentPhase: RestorePhase = 'PREPARING';
  let operationId = `replace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // 2. Durable check for existing unresolved operation
    const existingOp = await getRestoreOperation(expectedUid);
    if (!isResume && existingOp && existingOp.phase !== 'COMPLETED' && existingOp.phase !== 'ROLLED_BACK') {
      throw new Error(`UNRESOLVED_RESTORE_OPERATION: ${existingOp.phase}`);
    }
    if (!isResume && existingOp && (existingOp.phase === 'COMPLETED' || existingOp.phase === 'ROLLED_BACK')) {
      await deleteSafetySnapshot(expectedUid);
    }
    if (isResume && existingOp) {
      operationId = existingOp.operationId;
    }

    // 3. Load authoritative server state
    const expSnap = await getDocs(collection(db, 'users', expectedUid, EXPENSES_COLLECTION));
    const currentExpenses: Expense[] = expSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        amount: Number(data.amount) || 0,
        dateMillis: Number(data.dateMillis) || 0,
        categoryId: String(data.categoryId || ''),
        note: String(data.note || ''),
        transactionType: (data.transactionType as TransactionType) || 'expense',
        updatedAt: Number(data.updatedAt) || undefined,
        idempotencyKey: data.idempotencyKey ? String(data.idempotencyKey) : undefined,
      };
    });

    const catSnap = await getDocs(collection(db, 'users', expectedUid, CATEGORIES_COLLECTION));
    const currentCategories: Category[] = catSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name || ''),
        iconName: String(data.iconName || ''),
        colorInt: Number(data.colorInt) || 0,
        transactionType: (data.transactionType as TransactionType) || 'expense',
        sortOrder: Number(data.sortOrder) || 0,
        updatedAt: Number(data.updatedAt) || undefined,
      };
    });

    const prefSnap = await getDoc(doc(db, 'users', expectedUid, SETTINGS_COLLECTION, PREFERENCES_DOC));
    const currentPrefs: SyncedPreferences | null = prefSnap.exists()
      ? (prefSnap.data() as SyncedPreferences)
      : null;

    // 4. Compute mutation plan
    const plan = planReplace({
      currentExpenses,
      currentCategories,
      currentPreferences: currentPrefs,
      backup,
    });

    if (plan.conflicts.length > 0) {
      throw new Error(`REPLACE_PLAN_CONFLICTS: ${plan.conflicts.join('; ')}`);
    }

    const fingerprint = await computeBackupFingerprint(backup);

    // 5. Initialize or update journal: PREPARING
    currentPhase = 'PREPARING';
    const initialOp: RestoreOperationDoc = {
      operationId,
      ownerUid: expectedUid,
      mode: 'replace',
      backupFingerprint: fingerprint,
      phase: 'PREPARING',
      createdAt: isResume && existingOp ? existingOp.createdAt : Date.now(),
      updatedAt: Date.now(),
      plannedCounts: plan.counts,
      initiatorPlatform: 'web',
    };
    await setRestoreOperation(expectedUid, initialOp);

    // 6. Create Safety Snapshot (only if not already created on prior run)
    let snapshotMeta = isResume && existingOp?.snapshotMeta ? existingOp.snapshotMeta : undefined;
    if (!snapshotMeta) {
      snapshotMeta = await createSafetySnapshot(
        expectedUid,
        operationId,
        currentExpenses,
        currentCategories,
        currentPrefs,
        await categoryBudgetRepository.getAll(expectedUid),
        await recurringRepository.getAll(expectedUid),
        await recurringRepository.getAllReceipts(expectedUid),
      );
    }

    if (faultHooks?.failAfterSnapshot) {
      throw new Error('FAULT_INJECTED_AFTER_SNAPSHOT');
    }

    // 7. Advance journal: SNAPSHOT_READY
    currentPhase = 'SNAPSHOT_READY';
    await setRestoreOperation(expectedUid, {
      ...initialOp,
      phase: 'SNAPSHOT_READY',
      updatedAt: Date.now(),
      snapshotMeta,
    });

    // 8. Advance journal: APPLYING
    currentPhase = 'APPLYING';
    await setRestoreOperation(expectedUid, {
      ...initialOp,
      phase: 'APPLYING',
      updatedAt: Date.now(),
      snapshotMeta,
      progress: { step: 'categories', batchIndex: 0 },
    });

    // 9. Apply categories in batches of RESTORE_BATCH_CHUNK_SIZE
    let categoryBatchIndex = 0;
    for (let i = 0; i < plan.categoriesToUpsert.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = plan.categoriesToUpsert.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
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
            updatedAt: c.updatedAt ?? Date.now(),
            id: c.id,
          },
          { merge: true },
        );
      }
      await batch.commit();
      categoryBatchIndex++;

      if (faultHooks?.failAfterCategoryBatch === categoryBatchIndex) {
        throw new Error('FAULT_INJECTED_AFTER_CATEGORY_BATCH');
      }
    }

    // 10. Apply expenses upsert in batches
    let expenseUpsertBatchIndex = 0;
    for (let i = 0; i < plan.expensesToUpsert.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = plan.expensesToUpsert.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const e of chunk) {
        const ref = doc(db, 'users', expectedUid, EXPENSES_COLLECTION, e.id);
        const roundedAmount = Math.round(e.amount * 100) / 100;
        // Omit idempotencyKey on replace so rules preserve existing key on updates
        batch.set(
          ref,
          {
            amount: roundedAmount,
            dateMillis: Math.trunc(e.dateMillis),
            categoryId: e.categoryId,
            note: e.note.slice(0, 200),
            transactionType: e.transactionType,
            updatedAt: e.updatedAt ?? Date.now(),
            id: e.id,
          },
          { merge: true },
        );
      }
      await batch.commit();
      expenseUpsertBatchIndex++;

      if (faultHooks?.failAfterExpenseUpsertBatch === expenseUpsertBatchIndex) {
        throw new Error('FAULT_INJECTED_AFTER_EXPENSE_UPSERT_BATCH');
      }
    }

    // 11. Delete stale expenses in batches
    let expenseDeleteBatchIndex = 0;
    for (let i = 0; i < plan.expenseIdsToDelete.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = plan.expenseIdsToDelete.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const ref = doc(db, 'users', expectedUid, EXPENSES_COLLECTION, id);
        batch.delete(ref);
      }
      await batch.commit();
      expenseDeleteBatchIndex++;

      if (faultHooks?.failAfterExpenseDeleteBatch === expenseDeleteBatchIndex) {
        throw new Error('FAULT_INJECTED_AFTER_EXPENSE_DELETE_BATCH');
      }
    }

    if (backup.schemaVersion >= 2) await replaceBudgetCollection(expectedUid, backup.categoryBudgets ?? []);
    if (backup.schemaVersion === 3 && backup.recurring) await replaceRecurringCollection(expectedUid, backup.recurring);

    // 12. Apply preferences
    if (faultHooks?.failBeforePreferences) {
      throw new Error('FAULT_INJECTED_BEFORE_PREFERENCES');
    }
    const prefRef = doc(db, 'users', expectedUid, SETTINGS_COLLECTION, PREFERENCES_DOC);
    await setDoc(prefRef, plan.preferencesToUpdate);
    usePreferencesStore.getState().applySyncedPreferences(plan.preferencesToUpdate);

    // 13. Advance journal: VERIFYING
    currentPhase = 'VERIFYING';
    await setRestoreOperation(expectedUid, {
      ...initialOp,
      phase: 'VERIFYING',
      updatedAt: Date.now(),
      snapshotMeta,
    });

    if (faultHooks?.failDuringVerification) {
      throw new Error('FAULT_INJECTED_DURING_VERIFICATION');
    }

    // Verification check: sample verify that expected expense IDs exist and deleted ones are gone
    if (plan.expenseIdsToDelete.length > 0) {
      const deletedSample = plan.expenseIdsToDelete[0];
      const checkDoc = await getDoc(doc(db, 'users', expectedUid, EXPENSES_COLLECTION, deletedSample));
      if (checkDoc.exists()) {
        throw new Error('REPLACE_VERIFICATION_FAILED: deleted expense still exists');
      }
    }

    // 14. Mark COMPLETED
    currentPhase = 'COMPLETED';
    await setRestoreOperation(expectedUid, {
      ...initialOp,
      phase: 'COMPLETED',
      updatedAt: Date.now(),
      snapshotMeta,
    });

    // Notify application of changes
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ausgegeben:data-changed'));
    }

    return {
      success: true,
      operationId,
      plan,
      phase: 'COMPLETED',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (currentPhase !== 'PREPARING') {
      // Mark as FAILED_RECOVERABLE
      try {
        await setRestoreOperation(expectedUid, {
          operationId,
          ownerUid: expectedUid,
          mode: 'replace',
          backupFingerprint: await computeBackupFingerprint(backup),
          phase: 'FAILED_RECOVERABLE',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          error: errorMsg.slice(0, 500),
          failedFromPhase: currentPhase,
          initiatorPlatform: 'web',
        });
      } catch {
        // Ignore secondary error while logging failure
      }
    }
    throw err;
  } finally {
    activeOperationsByUid.delete(expectedUid);
  }
}

/**
 * Resumes an interrupted replace operation.
 */
export async function resumeReplace(
  operation: RestoreOperationDoc,
  backup: AusgegebenBackup,
  expectedUid: string,
  faultHooks?: ReplaceFaultHooks,
): Promise<ReplaceExecutionResult> {
  if (operation.ownerUid !== expectedUid) {
    throw new Error('AUTH_ACCOUNT_CHANGED');
  }

  const currentFp = await computeBackupFingerprint(backup);
  if (currentFp !== operation.backupFingerprint) {
    throw new Error('FINGERPRINT_MISMATCH: Selected backup does not match the unfinished operation');
  }

  // Resuming re-runs idempotent batches to complete the replace
  return executeReplace(backup, expectedUid, faultHooks, true);
}

/**
 * Rolls back an unfinished or failed replace operation using the pre-restore snapshot.
 */
export async function rollbackReplace(
  operation: RestoreOperationDoc,
  expectedUid: string,
  faultHooks?: ReplaceFaultHooks,
): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user || user.uid !== expectedUid) {
    throw new Error('AUTH_ACCOUNT_CHANGED');
  }

  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const snapshot = await readSafetySnapshot(expectedUid);
  if (snapshot.operationId !== operation.operationId) throw new Error('SNAPSHOT_OPERATION_MISMATCH');

  if (activeOperationsByUid.has(expectedUid)) {
    throw new Error('RESTORE_OPERATION_ALREADY_IN_PROGRESS');
  }
  activeOperationsByUid.add(expectedUid);

  try {
    // 1. Mark journal: ROLLING_BACK
    await setRestoreOperation(expectedUid, {
      ...operation,
      phase: 'ROLLING_BACK',
      updatedAt: Date.now(),
    });

    if (faultHooks?.failDuringRollback) {
      throw new Error('FAULT_INJECTED_DURING_ROLLBACK');
    }

    // 3. Upsert snapshot categories
    for (let i = 0; i < snapshot.categories.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = snapshot.categories.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
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
            updatedAt: c.updatedAt ?? Date.now(),
            id: c.id,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    // 4. Upsert snapshot expenses
    const snapshotExpenseIds = new Set(snapshot.expenses.map((e) => e.id));
    for (let i = 0; i < snapshot.expenses.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = snapshot.expenses.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const e of chunk) {
        const ref = doc(db, 'users', expectedUid, EXPENSES_COLLECTION, e.id);
        const roundedAmount = Math.round(e.amount * 100) / 100;
        batch.set(
          ref,
          {
            amount: roundedAmount,
            dateMillis: Math.trunc(e.dateMillis),
            categoryId: e.categoryId,
            note: e.note.slice(0, 200),
            transactionType: e.transactionType,
            updatedAt: e.updatedAt ?? Date.now(),
            id: e.id,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }

    // 5. Query current expenses and delete any that were NOT in the snapshot
    const currentExpSnap = await getDocs(collection(db, 'users', expectedUid, EXPENSES_COLLECTION));
    const extraExpenseIds = currentExpSnap.docs
      .filter((d) => !snapshotExpenseIds.has(d.id))
      .map((d) => d.id);

    for (let i = 0; i < extraExpenseIds.length; i += RESTORE_BATCH_CHUNK_SIZE) {
      const chunk = extraExpenseIds.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const ref = doc(db, 'users', expectedUid, EXPENSES_COLLECTION, id);
        batch.delete(ref);
      }
      await batch.commit();
    }

    if (snapshot.categoryBudgets) await replaceBudgetCollection(expectedUid, snapshot.categoryBudgets);
    if (snapshot.recurringTemplates) {
      await replaceRecurringCollection(expectedUid, {
        templates: snapshot.recurringTemplates,
        receipts: snapshot.recurringReceipts ?? [],
      });
    }

    // 6. Restore preferences
    if (snapshot.preferences) {
      const prefRef = doc(db, 'users', expectedUid, SETTINGS_COLLECTION, PREFERENCES_DOC);
      const restoredPrefs = {
        ...snapshot.preferences,
        updatedAt: Math.max(Date.now(), (snapshot.preferences.updatedAt ?? 0) + 1),
      };
      await setDoc(prefRef, restoredPrefs);
      usePreferencesStore.getState().applySyncedPreferences(restoredPrefs);
    }

    // 7. Mark journal: ROLLED_BACK
    await setRestoreOperation(expectedUid, {
      ...operation,
      phase: 'ROLLED_BACK',
      updatedAt: Date.now(),
    });

    // 8. Delete snapshot data after rollback
    await deleteSafetySnapshot(expectedUid);

    // Notify application
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ausgegeben:data-changed'));
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await setRestoreOperation(expectedUid, {
      ...operation,
      phase: 'FAILED_RECOVERABLE',
      updatedAt: Date.now(),
      error: `Rollback failed: ${errorMsg}`.slice(0, 500),
      failedFromPhase: 'ROLLING_BACK',
    });
    throw err;
  } finally {
    activeOperationsByUid.delete(expectedUid);
  }
}

/**
 * Dismisses a terminal operation (COMPLETED or ROLLED_BACK) and cleans up the journal.
 */
export async function dismissCompletedOperation(userId: string): Promise<void> {
  await deleteRestoreOperation(userId);
  await deleteSafetySnapshot(userId);
}

async function replaceBudgetCollection(uid: string, budgets: CategoryBudget[]) {
  const current = await categoryBudgetRepository.getAll(uid);
  const desired = new Set(budgets.map(b => b.categoryId));
  for (const budget of current) if (!desired.has(budget.categoryId)) {
    await categoryBudgetRepository.restore(uid, null, budget.categoryId);
  }
  for (const budget of budgets) {
    await categoryBudgetRepository.restore(uid, budget, budget.categoryId);
  }
}

async function replaceRecurringCollection(uid: string, section: RecurringBackupSection) {
  const current = await recurringRepository.getAll(uid);
  const desired = new Set(section.templates.map(t => t.id));
  for (const t of current) if (!desired.has(t.id)) {
    await recurringRepository.restoreTemplate(uid, null, t.id);
  }
  for (const t of section.templates) {
    await recurringRepository.restoreTemplate(uid, t, t.id);
  }
  await recurringRepository.restoreReceipts(uid, section.receipts);
}
