import { db, bumpRevision } from '@/services/database';
import { cloudSyncRepository } from '@/repositories/cloudSyncRepository';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import type { Category, Expense } from '@/models/types';

export function isCloudSyncActive(): boolean {
  const { user } = useAuthStore.getState();
  const { storageMode } = usePreferencesStore.getState();
  return Boolean(user && storageMode === 'cloud' && getFirebaseFirestore());
}

function uid(): string | null {
  return useAuthStore.getState().user?.uid ?? null;
}

export const syncService = {
  async fullSync(): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!firestore || !userId) return;

    const { setSyncing } = useAuthStore.getState();
    const { setLastCloudSyncAt } = usePreferencesStore.getState();
    setSyncing(true);
    try {
      const localCategories = await db.categories.toArray();
      const localExpenses = await db.expenses.toArray();
      await cloudSyncRepository.pushAll(firestore, userId, localCategories, localExpenses);

      const remoteCategories = await cloudSyncRepository.pullCategories(firestore, userId);
      const remoteExpenses = await cloudSyncRepository.pullExpenses(firestore, userId);

      await db.transaction('rw', db.categories, db.expenses, async () => {
        for (const category of remoteCategories) {
          await db.categories.put(category);
        }
        for (const expense of remoteExpenses) {
          await db.expenses.put(expense);
        }
      });

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
    await cloudSyncRepository.pushCategory(firestore, userId, category);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async pushExpense(expense: Expense): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    await cloudSyncRepository.pushExpense(firestore, userId, expense);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async deleteCategory(id: number): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    await cloudSyncRepository.deleteCategory(firestore, userId, id);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },

  async deleteExpense(id: number): Promise<void> {
    const firestore = getFirebaseFirestore();
    const userId = uid();
    if (!isCloudSyncActive() || !firestore || !userId) return;
    await cloudSyncRepository.deleteExpense(firestore, userId, id);
    usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  },
};
