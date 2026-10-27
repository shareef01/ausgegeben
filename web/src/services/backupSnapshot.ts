/**
 * The Replace safety snapshot: a chunked copy of the account's categories, expenses,
 * budgets, recurring templates and preferences under /users/{userId}/restoreSnapshot/,
 * written before Replace changes anything and read back by rollback. Moved out of
 * backupReplace.ts unchanged; backupReplace.ts re-exports these functions.
 */
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import * as safety from '@/services/safetySnapshot';
import { RESTORE_SNAPSHOT_COLLECTION } from '@/repositories/firestorePaths';
import type { Category, Expense, SyncedPreferences } from '@/models/types';
import type { CategoryBudget } from '@/services/categoryBudgets';
import type { RecurringTemplate } from '@/services/recurrence';
import type { OccurrenceReceipt } from '@/services/recurringBackupSection';
import { RESTORE_BATCH_CHUNK_SIZE, SNAPSHOT_CHUNK_SIZE } from '@/services/restoreLimits';

/**
 * Creates persistent, chunked safety snapshot documents under /users/{userId}/restoreSnapshot/.
 */
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
): Promise<{ chunkCount: number; totalExpenses: number; totalCategories: number; receiptChunkCount?: number }> {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('FIRESTORE_UNAVAILABLE');

  const now = Date.now();
  const chunkCount = Math.ceil(expenses.length / SNAPSHOT_CHUNK_SIZE) || 1;
  const receiptChunkCount = recurringReceipts && recurringReceipts.length > 0
    ? Math.ceil(recurringReceipts.length / SNAPSHOT_CHUNK_SIZE)
    : 0;

  // Write snapshot metadata (unbounded recurring receipts are chunked separately to obey 1MB Firestore limit)
  const metaRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, 'meta');
  await setDoc(metaRef, {
    operationId,
    ownerUid: userId,
    createdAt: now,
    chunkCount,
    receiptChunkCount,
    totalExpenses: expenses.length,
    totalCategories: categories.length,
    totalReceipts: recurringReceipts?.length ?? 0,
    preferences: preferences ?? {},
    ...(categoryBudgets ? { categoryBudgets } : {}),
    ...(recurringTemplates ? { recurringTemplates } : {}),
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
        ...(e.idempotencyKey ? { idempotencyKey: e.idempotencyKey } : {}),
        ...(e.deleted !== undefined ? { deleted: e.deleted } : {}),
        ...(e.cloudId ? { cloudId: e.cloudId } : {}),
        ...(e.categoryCloudId != null ? { categoryCloudId: e.categoryCloudId } : {}),
        ...(e.receiptImagePath != null ? { receiptImagePath: e.receiptImagePath } : {}),
      })),
    });
  }

  // Write recurring receipt chunks (chunked separately to prevent exceeding 1MB per document)
  if (recurringReceipts && receiptChunkCount > 0) {
    for (let i = 0; i < receiptChunkCount; i++) {
      const chunkReceipts = recurringReceipts.slice(i * SNAPSHOT_CHUNK_SIZE, (i + 1) * SNAPSHOT_CHUNK_SIZE);
      const chunkRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, `receipt_chunk_${i}`);
      await setDoc(chunkRef, {
        operationId,
        ownerUid: userId,
        createdAt: now,
        chunkIndex: i,
        chunkCount: receiptChunkCount,
        recurringReceipts: chunkReceipts.map((r) => ({
          id: r.id,
          templateId: r.templateId,
          scheduledDate: r.scheduledDate,
          expenseId: r.expenseId,
          createdAt: r.createdAt,
        })),
      });
    }
  }

  // Verify write back
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) {
    throw new Error('SNAPSHOT_VERIFICATION_FAILED: meta missing');
  }

  return {
    chunkCount,
    receiptChunkCount,
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
  // AUD-006: strict, count-checked reading. A malformed row must fail the rollback here — with
  // the journal and the snapshot intact — instead of being defaulted or dropped and then
  // written back as authoritative state.
  const metaData = (metaSnap.data() ?? {}) as Record<string, unknown>;
  const snapshotOperationId = safety.operationId(metaData);
  const snapshotChunkCount = safety.chunkCount(metaData, 'chunkCount');
  const snapshotCategories = safety.categories(metaData);
  safety.requireCount(
    safety.declaredCount(metaData, 'totalCategories'),
    snapshotCategories.length,
    'meta.totalCategories',
  );
  const snapshotPreferences = safety.preferences(metaData);
  const snapshotBudgets = safety.budgets(metaData);
  const snapshotTemplates = safety.templates(metaData);

  const allExpenses: Expense[] = [];
  for (let i = 0; i < snapshotChunkCount; i++) {
    const chunkRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, `chunk_${i}`);
    const chunkSnap = await getDocFromServer(chunkRef);
    if (!chunkSnap.exists() || chunkSnap.data().operationId !== snapshotOperationId) throw new Error('SNAPSHOT_CHUNK_MISSING_OR_CHANGED');
    allExpenses.push(...safety.expenses(chunkSnap.data() as Record<string, unknown>, `chunk_${i}`));
  }
  safety.requireCount(safety.declaredCount(metaData, 'totalExpenses'), allExpenses.length, 'meta.totalExpenses');

  const allReceipts: OccurrenceReceipt[] = [];
  const receiptChunkCount = safety.chunkCount(metaData, 'receiptChunkCount', 'meta', 0);
  if (receiptChunkCount > 0) {
    for (let i = 0; i < receiptChunkCount; i++) {
      const chunkRef = doc(db, 'users', userId, RESTORE_SNAPSHOT_COLLECTION, `receipt_chunk_${i}`);
      const chunkSnap = await getDocFromServer(chunkRef);
      // Fail closed like the expense chunks: rollback replaces the receipts collection
      // with this list, so a dropped chunk would re-materialise those occurrences.
      if (!chunkSnap.exists() || chunkSnap.data().operationId !== snapshotOperationId) {
        throw new Error('SNAPSHOT_CHUNK_MISSING_OR_CHANGED');
      }
      const data = chunkSnap.data() as Record<string, unknown>;
      allReceipts.push(...safety.receipts(data.recurringReceipts, `receipt_chunk_${i}.recurringReceipts`));
    }
  } else {
    allReceipts.push(...safety.receipts(metaData.recurringReceipts, 'meta.recurringReceipts'));
  }
  safety.requireCount(safety.declaredCount(metaData, 'totalReceipts'), allReceipts.length, 'meta.totalReceipts');

  return {
    categoryBudgets: snapshotBudgets,
    recurringTemplates: snapshotTemplates,
    recurringReceipts: allReceipts,
    operationId: snapshotOperationId,
    expenses: allExpenses,
    categories: snapshotCategories,
    preferences: snapshotPreferences,
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

  for (let i = 0; i < snap.docs.length; i += RESTORE_BATCH_CHUNK_SIZE) {
    const chunk = snap.docs.slice(i, i + RESTORE_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
