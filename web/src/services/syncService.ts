import { db, bumpRevision } from '@/services/database';
import { cloudSyncRepository } from '@/repositories/cloudSyncRepository';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { isCloudSyncActive } from '@/services/cloudSync';
import { receiptService } from '@/services/receiptService';
import { mergeById, mergePreferences } from '@/utils/syncMerge';
import type { Category, Expense, SyncedPreferences } from '@/models/types';

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
    monthlyBudget: s.monthlyBudget,
    updatedAt: s.preferencesUpdatedAt,
  };
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

export const syncService = {
  async fullSync(): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!firestore || !userId) return;

    const { setSyncing } = useAuthStore.getState();
    const { setLastCloudSyncAt, applySyncedPreferences, preferencesUpdatedAt } = usePreferencesStore.getState();
    setSyncing(true);
    try {
      const localCategories = await db.categories.toArray();
      const localExpenses = await db.expenses.toArray();
      const localPrefs = toSyncedPreferences();

      const remoteCategories = await cloudSyncRepository.pullCategories(firestore, userId);
      const remoteExpenses = await cloudSyncRepository.pullExpenses(firestore, userId);
      const remotePrefs = await cloudSyncRepository.pullPreferences(firestore, userId);

      const catMerge = mergeById(
        localCategories.map((c) => ({ ...c, updatedAt: c.updatedAt ?? 0 })),
        remoteCategories,
      );
      const expMerge = mergeById(
        localExpenses.map((e) => ({ ...e, updatedAt: e.updatedAt ?? e.dateMillis })),
        remoteExpenses,
      );
      const mergedPrefs = mergePreferences(
        { ...localPrefs, updatedAt: preferencesUpdatedAt },
        remotePrefs,
      );

      await db.transaction('rw', db.categories, db.expenses, async () => {
        for (const id of catMerge.toDeleteLocal) {
          await db.expenses.where('categoryId').equals(id).delete();
          await db.categories.delete(id);
        }
        for (const category of catMerge.toApplyLocal) {
          await db.categories.put(category);
        }
        for (const id of expMerge.toDeleteLocal) {
          const expense = await db.expenses.get(id);
          await db.expenses.delete(id);
          if (expense?.receiptImagePath) {
            await receiptService.deletePath(expense.receiptImagePath);
          }
        }
        for (const expense of expMerge.toApplyLocal) {
          await db.expenses.put(expense);
        }
      });

      applySyncedPreferences(mergedPrefs);

      await cloudSyncRepository.pushAll(firestore, userId, catMerge.toPushRemote, expMerge.toPushRemote);
      await cloudSyncRepository.pushPreferences(firestore, userId, mergedPrefs);
      await uploadReceiptsForExpenses(expMerge.toPushRemote);
      await syncReceiptsForExpenses(expMerge.toApplyLocal);

      setLastCloudSyncAt(Date.now());
      bumpRevision();
    } finally {
      setSyncing(false);
    }
  },

  async pushCategory(category: Category): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const stamped = { ...category, updatedAt: category.updatedAt ?? now() };
    await cloudSyncRepository.pushCategory(firestore, userId, stamped);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async pushExpense(expense: Expense): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const stamped = { ...expense, updatedAt: expense.updatedAt ?? now() };
    await receiptService.uploadToCloud(stamped.receiptImagePath);
    await cloudSyncRepository.pushExpense(firestore, userId, stamped);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async deleteCategory(id: number): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    await cloudSyncRepository.tombstoneCategory(firestore, userId, id);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async deleteExpense(id: number): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    await cloudSyncRepository.tombstoneExpense(firestore, userId, id);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async pushPreferences(): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    const prefs = toSyncedPreferences();
    await cloudSyncRepository.pushPreferences(firestore, userId, prefs);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },
};
