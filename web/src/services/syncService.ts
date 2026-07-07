import {
  clearCategoryPendingSync,
  clearExpensePendingSync,
  patchCategoryUpdatedAt,
  patchExpenseUpdatedAt,
  db,
  bumpRevision,
  getCategoryByCloudId,
  getExpenseByCloudId,
} from '@/services/database';
import { cloudSyncRepository, type CloudCategory, type CloudExpense } from '@/repositories/cloudSyncRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import { getFirebaseAuth, getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { isCloudSyncActive } from '@/services/cloudSync';
import { receiptService } from '@/services/receiptService';
import { mergeById, mergePreferences } from '@/utils/syncMerge';
import { mapSyncError } from '@/utils/syncErrorMessages';
import { resolveSyncPullMode } from '@/utils/syncUtils';
import { setCategoryCache } from '@/services/categoryCache';
import type { Category, Expense, SyncedPreferences } from '@/models/types';
import { t } from '@/i18n';

export interface SyncResult {
  ok: boolean;
  appliedCategories: number;
  appliedExpenses: number;
  remoteCategories: number;
  remoteExpenses: number;
  error?: string;
}

const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let syncInFlight: Promise<SyncResult> | null = null;

function uid(): string | null {
  return useAuthStore.getState().user?.uid ?? null;
}

function now(): number {
  return Date.now();
}

function toSyncedPreferences(): SyncedPreferences {
  const s = usePreferencesStore.getState();
  return {
    currency: s.currency,
    locale: s.locale,
    themeMode: s.themeMode,
    dailyReminder: s.dailyReminder,
    reminderHour: s.reminderHour,
    reminderMinute: s.reminderMinute,
    analyticsPeriod: s.analyticsPeriod,
    recordListPeriod: s.recordListPeriod,
    monthlyBudget: s.monthlyBudget,
    updatedAt: s.preferencesUpdatedAt,
  };
}

function reportPushError(error: unknown): void {
  const message = mapSyncError(error);
  useAuthStore.getState().setSyncError(message);
  useToastStore.getState().show(message);
}

async function pushPendingTombstones(firestore: NonNullable<ReturnType<typeof getFirebaseFirestore>>, userId: string): Promise<void> {
  const {
    pendingExpenseDeleteCloudIds,
    pendingCategoryDeleteCloudIds,
    removePendingExpenseDelete,
    removePendingCategoryDelete,
  } = usePreferencesStore.getState();

  for (const cloudId of pendingExpenseDeleteCloudIds) {
    try {
      await cloudSyncRepository.tombstoneExpenseCloudId(firestore, userId, cloudId);
      removePendingExpenseDelete(cloudId);
    } catch {
      // keep in queue for next sync
    }
  }
  for (const cloudId of pendingCategoryDeleteCloudIds) {
    try {
      await cloudSyncRepository.tombstoneCategoryCloudId(firestore, userId, cloudId);
      removePendingCategoryDelete(cloudId);
    } catch {
      // keep in queue for next sync
    }
  }
}

async function ensureAuthToken(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (user) await user.getIdToken(true);
}

async function verifyFirestoreAccess(userId: string): Promise<void> {
  const firestore = getFirebaseFirestore();
  if (!firestore) throw new Error('Firestore is not configured');
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const userRef = doc(firestore, 'users', userId);
  const snap = await getDoc(userRef);
  const payload: Record<string, number> = { lastPullAt: now() };
  const existingPush = snap.data()?.lastPushAt;
  if (typeof existingPush === 'number' && existingPush > 0) {
    payload.lastPushAt = existingPush;
  }
  await setDoc(userRef, payload);
}

async function resolveCategoryId(categoryCloudId: string, legacyCategoryId = 0): Promise<number | null> {
  if (categoryCloudId) {
    const byCloudId = await getCategoryByCloudId(categoryCloudId);
    if (byCloudId?.id != null) return byCloudId.id;
    const numeric = Number(categoryCloudId);
    if (!Number.isNaN(numeric) && numeric > 0) {
      const byId = await db.categories.get(numeric);
      if (byId?.id != null) return byId.id;
    }
  }
  if (legacyCategoryId > 0) {
    const byId = await db.categories.get(legacyCategoryId);
    if (byId?.id != null) return byId.id;
  }
  return null;
}

async function upsertCategory(category: Category): Promise<void> {
  const existing = await getCategoryByCloudId(category.cloudId);
  await db.categories.put({
    ...category,
    id: existing?.id,
    pendingSync: false,
  });
}

async function pushExpenseIfCloud(expense: Expense): Promise<void> {
  const firestore = getFirebaseFirestore();
  const userId = uid();
  if (!isCloudSyncActive() || !firestore || !userId) return;
  const category = await db.categories.get(expense.categoryId);
  if (!category) return;
  const updatedAt = await cloudSyncRepository.pushExpense(firestore, userId, expense, category.cloudId);
  await patchExpenseUpdatedAt(expense.cloudId, updatedAt);
}

async function purgeRecoveredCategories(): Promise<void> {
  const recovered = await db.categories.filter((category) => category.name === 'Recovered').toArray();
  for (const category of recovered) {
    if (category.id == null) continue;
    const fallback = await expenseRepository.findFallbackCategory(category.transactionType, category.cloudId);
    if (fallback?.id != null && fallback.id !== category.id) {
      const toReassign = await db.expenses.where('categoryId').equals(category.id).toArray();
      await expenseRepository.reassignExpenses(category.id, fallback.id);
      for (const expense of toReassign) {
        const updated = expense.id != null ? await db.expenses.get(expense.id) : undefined;
        if (updated) await pushExpenseIfCloud(updated);
      }
    }
    await db.categories.delete(category.id);
  }
}

async function upsertExpense(
  expense: CloudExpense,
  remoteCategories: CloudCategory[],
): Promise<boolean> {
  if (expense.deleted) return false;
  let categoryId = await resolveCategoryId(expense.categoryCloudId, expense.categoryId);
  if (categoryId == null) {
    const remoteCat = remoteCategories.find(
      (category) => category.cloudId === expense.categoryCloudId && !category.deleted,
    );
    if (remoteCat) {
      await upsertCategory(remoteCat);
      categoryId = await resolveCategoryId(expense.categoryCloudId, expense.categoryId);
    }
  }
  if (categoryId == null) {
    const fallback = await expenseRepository.findFallbackCategory(expense.transactionType, expense.categoryCloudId);
    if (fallback?.id == null) return false;
    categoryId = fallback.id;
  }
  const existing = await getExpenseByCloudId(expense.cloudId);
  await db.expenses.put({
    cloudId: expense.cloudId,
    amount: expense.amount,
    dateMillis: expense.dateMillis,
    categoryId,
    note: expense.note,
    receiptImagePath: expense.receiptImagePath,
    transactionType: expense.transactionType,
    updatedAt: expense.updatedAt,
    pendingSync: false,
    id: existing?.id,
  });
  return true;
}

function countActiveRemote<T extends { deleted?: boolean }>(items: T[]): number {
  return items.filter((item) => !item.deleted).length;
}

function categoryCloudIdMap(categories: Category[]): Map<number, string> {
  return new Map(
    categories
      .filter((category): category is Category & { id: number } => category.id != null)
      .map((category) => [category.id, category.cloudId]),
  );
}

type MergeExpense = Expense & { categoryCloudId: string; deleted?: boolean };

function toMergeExpense(expense: Expense, categoryCloudIds: Map<number, string>): MergeExpense | null {
  const categoryCloudId = categoryCloudIds.get(expense.categoryId);
  if (!categoryCloudId) return null;
  return { ...expense, categoryCloudId };
}

async function syncReceiptsForExpenses(expenses: Expense[]): Promise<void> {
  for (const expense of expenses) {
    if (!expense.receiptImagePath) continue;
    await receiptService.ensureLocal(expense.receiptImagePath);
  }
}

async function uploadReceiptsForExpenses(expenses: Expense[]): Promise<void> {
  for (const expense of expenses) {
    if (!expense.receiptImagePath) continue;
    await receiptService.uploadToCloud(expense.receiptImagePath);
  }
}

async function runFullSync(fullPull = false): Promise<SyncResult> {
  const firestore = getFirebaseFirestore();
  const userId = uid();
  if (!firestore || !userId) {
    const message = !firestore
      ? t('settingsSyncErrorNotConfigured')
      : t('settingsSyncErrorSignIn');
    useAuthStore.getState().setSyncError(message);
    return { ok: false, appliedCategories: 0, appliedExpenses: 0, remoteCategories: 0, remoteExpenses: 0, error: message };
  }

  const { setSyncing, setSyncError } = useAuthStore.getState();
  const { setLastCloudSyncAt, applySyncedPreferences, preferencesUpdatedAt } = usePreferencesStore.getState();
  setSyncing(true);
  setSyncError(null);

  const syncAnchor = now();
  const { since, isIncremental, effectiveFullPull } = resolveSyncPullMode(
    fullPull,
    usePreferencesStore.getState().lastCloudSyncAt,
    syncAnchor,
  );

  try {
    await ensureAuthToken();
    await verifyFirestoreAccess(userId);
    await pushPendingTombstones(firestore, userId);

    const {
      pendingExpenseDeleteCloudIds,
      pendingCategoryDeleteCloudIds,
      removePendingExpenseDelete,
      removePendingCategoryDelete,
    } = usePreferencesStore.getState();
    const pendingExpenseDeletes = new Set(pendingExpenseDeleteCloudIds);
    const pendingCategoryDeletes = new Set(pendingCategoryDeleteCloudIds);

    const catPull = await cloudSyncRepository.pullCategories(firestore, userId, since);
    const expPull = await cloudSyncRepository.pullExpenses(firestore, userId, since);
    const remoteCategories = catPull.records;
    const remoteExpenses = expPull.records;
    const remotePrefs = await cloudSyncRepository.pullPreferences(firestore, userId);

    const duplicateCategoryCloudIds = new Set(catPull.duplicateCloudIds);
    const duplicateExpenseCloudIds = new Set(expPull.duplicateCloudIds);
    const localCategories = (await db.categories.toArray())
      .filter((category) => !duplicateCategoryCloudIds.has(category.cloudId));
    const localExpenses = (await db.expenses.toArray())
      .filter((expense) => !duplicateExpenseCloudIds.has(expense.cloudId));
    const localPrefs = toSyncedPreferences();
    const categoryCloudIds = categoryCloudIdMap(localCategories);
    const recoveryMode = !isIncremental && countActiveRemote(remoteExpenses) > localExpenses.length;

    const catMerge = mergeById(
      localCategories.map((category) => ({ ...category, updatedAt: category.updatedAt ?? 0 })),
      remoteCategories,
      {
        isIncremental,
        ignoreRemoteDeletes: isIncremental || recoveryMode,
        pendingDeleteCloudIds: pendingCategoryDeletes,
      },
    );
    const expMerge = mergeById(
      localExpenses
        .map((expense) => toMergeExpense(expense, categoryCloudIds))
        .filter((expense): expense is MergeExpense => expense != null)
        .map((expense) => ({ ...expense, updatedAt: expense.updatedAt ?? expense.dateMillis })),
      remoteExpenses,
      {
        isIncremental,
        ignoreRemoteDeletes: isIncremental || recoveryMode,
        pendingDeleteCloudIds: pendingExpenseDeletes,
      },
    );

    for (const record of remoteCategories) {
      if (record.deleted) removePendingCategoryDelete(record.cloudId);
    }
    for (const record of remoteExpenses) {
      if (record.deleted) removePendingExpenseDelete(record.cloudId);
    }
    const mergedPrefs = mergePreferences(
      { ...localPrefs, updatedAt: preferencesUpdatedAt || now() },
      remotePrefs,
    );

    await db.transaction('rw', db.categories, db.expenses, async () => {
      // Reassign expenses from duplicate categories to canonical survivors
      for (const [dupCloudId, canonicalCloudId] of Object.entries(catPull.remapCloudIds)) {
        const [dupCat, canonicalCat] = await Promise.all([
          getCategoryByCloudId(dupCloudId),
          getCategoryByCloudId(canonicalCloudId),
        ]);
        if (dupCat?.id != null && canonicalCat?.id != null && dupCat.id !== canonicalCat.id) {
          await expenseRepository.reassignExpenses(dupCat.id, canonicalCat.id);
        }
      }

      if (duplicateCategoryCloudIds.size > 0) {
        await db.categories.where('cloudId').anyOf([...duplicateCategoryCloudIds]).delete();
      }

      for (const id of catMerge.toDeleteLocal) {
        await db.expenses.where('categoryId').equals(id).delete();
        await db.categories.delete(id);
      }
      for (const category of catMerge.toApplyLocal) {
        await upsertCategory(category);
      }
    });

    await db.transaction('rw', db.categories, db.expenses, async () => {
      if (duplicateExpenseCloudIds.size > 0) {
        await db.expenses.where('cloudId').anyOf([...duplicateExpenseCloudIds]).delete();
      }
      for (const id of expMerge.toDeleteLocal) {
        const expense = await db.expenses.get(id);
        await db.expenses.delete(id);
        if (expense?.receiptImagePath) {
          await receiptService.deletePath(expense.receiptImagePath);
        }
      }
      for (const expense of expMerge.toApplyLocal) {
        await upsertExpense(expense, remoteCategories);
      }
    });

    applySyncedPreferences(mergedPrefs);
    bumpRevision();
    await purgeRecoveredCategories();

    const refreshedCategories = await db.categories.toArray();
    setCategoryCache(refreshedCategories);
    const refreshedCategoryCloudIds = categoryCloudIdMap(refreshedCategories);

    try {
      await cloudSyncRepository.pushAll(
        firestore,
        userId,
        catMerge.toPushRemote,
        expMerge.toPushRemote,
        refreshedCategoryCloudIds,
      );
      const prefsUpdatedAt = await cloudSyncRepository.pushPreferences(firestore, userId, mergedPrefs);
      if (prefsUpdatedAt > 0) {
        applySyncedPreferences({ ...mergedPrefs, updatedAt: prefsUpdatedAt });
      }
      await uploadReceiptsForExpenses(expMerge.toPushRemote);
      await syncReceiptsForExpenses(expMerge.toApplyLocal);
      await clearCategoryPendingSync(catMerge.toPushRemote.map((category) => category.cloudId));
      await clearExpensePendingSync(expMerge.toPushRemote.map((expense) => expense.cloudId));
      setLastCloudSyncAt(syncAnchor);
      setSyncError(null);
    } catch (pushError) {
      const message = mapSyncError(pushError);
      setSyncError(message);
      console.warn('[sync] Pull succeeded but push failed', pushError);
      return {
        ok: false,
        appliedCategories: catMerge.toApplyLocal.length,
        appliedExpenses: expMerge.toApplyLocal.length,
        remoteCategories: remoteCategories.filter((category) => !category.deleted).length,
        remoteExpenses: remoteExpenses.filter((expense) => !expense.deleted).length,
        error: message,
      };
    }

    if (effectiveFullPull) {
      try {
        await cloudSyncRepository.deleteLegacyDocs(firestore, userId, 'categories', catPull.legacyDocIdsToDelete);
        await cloudSyncRepository.deleteLegacyDocs(firestore, userId, 'expenses', expPull.legacyDocIdsToDelete);
        await cloudSyncRepository.tombstoneCloudIds(firestore, userId, 'categories', catPull.duplicateCloudIds);
        await cloudSyncRepository.tombstoneCloudIds(firestore, userId, 'expenses', expPull.duplicateCloudIds);
      } catch (cleanupError) {
        console.warn('[sync] Post-sync cleanup failed (data is synced)', cleanupError);
      }
    }

    return {
      ok: true,
      appliedCategories: catMerge.toApplyLocal.length,
      appliedExpenses: expMerge.toApplyLocal.length,
      remoteCategories: remoteCategories.filter((category) => !category.deleted).length,
      remoteExpenses: remoteExpenses.filter((expense) => !expense.deleted).length,
    };
  } catch (error) {
    const message = mapSyncError(error);
    setSyncError(message);
    console.error('[sync] fullSync failed', error);
    return {
      ok: false,
      appliedCategories: 0,
      appliedExpenses: 0,
      remoteCategories: 0,
      remoteExpenses: 0,
      error: message,
    };
  } finally {
    setSyncing(false);
  }
}

export const syncService = {
  async fullSync(force = false): Promise<SyncResult> {
    const lastSyncAt = usePreferencesStore.getState().lastCloudSyncAt ?? 0;
    if (!force && Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
      // Throttled — prior sync succeeded; don't leave a stale error banner.
      useAuthStore.getState().setSyncError(null);
      return {
        ok: true,
        appliedCategories: 0,
        appliedExpenses: 0,
        remoteCategories: 0,
        remoteExpenses: 0,
      };
    }
    if (syncInFlight) {
      return syncInFlight;
    }
    syncInFlight = runFullSync(force).finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  },

  async pushCategory(category: Category): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    try {
      const updatedAt = await cloudSyncRepository.pushCategory(firestore, userId, category);
      await patchCategoryUpdatedAt(category.cloudId, updatedAt);
    } catch (error) {
      reportPushError(error);
    }
  },

  async pushExpense(expense: Expense): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const category = await db.categories.get(expense.categoryId);
    if (!category) return;
    try {
      await receiptService.uploadToCloud(expense.receiptImagePath);
      const updatedAt = await cloudSyncRepository.pushExpense(firestore, userId, expense, category.cloudId);
      await patchExpenseUpdatedAt(expense.cloudId, updatedAt);
    } catch (error) {
      reportPushError(error);
    }
  },

  async deleteCategory(category: Category): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const { removePendingCategoryDelete, addPendingCategoryDelete } = usePreferencesStore.getState();
    try {
      const updatedAt = await cloudSyncRepository.tombstoneCategory(firestore, userId, category);
      await patchCategoryUpdatedAt(category.cloudId, updatedAt);
      removePendingCategoryDelete(category.cloudId);
    } catch (error) {
      addPendingCategoryDelete(category.cloudId);
      throw error;
    }
  },

  async deleteExpense(expense: Expense): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const { removePendingExpenseDelete, addPendingExpenseDelete } = usePreferencesStore.getState();
    try {
      const updatedAt = await cloudSyncRepository.tombstoneExpense(firestore, userId, expense);
      await patchExpenseUpdatedAt(expense.cloudId, updatedAt);
      removePendingExpenseDelete(expense.cloudId);
    } catch (error) {
      addPendingExpenseDelete(expense.cloudId);
      throw error;
    }
  },

  async pushPreferences(): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    try {
      const prefs = toSyncedPreferences();
      const updatedAt = await cloudSyncRepository.pushPreferences(firestore, userId, prefs);
      if (updatedAt > 0) {
        usePreferencesStore.getState().applySyncedPreferences({ ...prefs, updatedAt });
      }
    } catch (error) {
      reportPushError(error);
    }
  },
};
