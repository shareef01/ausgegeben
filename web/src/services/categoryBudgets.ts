import { collection, doc, getDocsFromServer, getDocFromServer, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { CATEGORY_BUDGETS_COLLECTION } from '@/repositories/firestorePaths';
import type { Category, Expense } from '@/models/types';
import { toMinorUnits } from '@/utils/money';

export interface CategoryBudget { categoryId: string; monthlyLimit: number; warningThresholdPercent: number; updatedAt: number }
export function validCategoryBudget(b: CategoryBudget): boolean {
  return typeof b.categoryId === 'string' && !!b.categoryId.trim() && !b.categoryId.includes('/') && b.categoryId.length <= 1500 && Number.isFinite(b.monthlyLimit)
    && b.monthlyLimit > 0 && b.monthlyLimit < 1e9 && Math.abs(b.monthlyLimit * 100 - Math.round(b.monthlyLimit * 100)) < 0.0001
    && Number.isInteger(b.warningThresholdPercent) && b.warningThresholdPercent >= 1 && b.warningThresholdPercent <= 100
    && Number.isSafeInteger(b.updatedAt) && b.updatedAt > 0;
}
export const categoryBudgetRepository = {
  observe(uid: string, cb: (rows: CategoryBudget[], incomplete: boolean, error: boolean) => void): Unsubscribe {
    let alive = true;
    const stop = onSnapshot(collection(getFirebaseFirestore()!, 'users', uid, CATEGORY_BUDGETS_COLLECTION), { includeMetadataChanges: true },
      snap => { if (alive && useAuthStore.getState().user?.uid === uid) cb(snap.docs.map(d => ({ ...d.data(), categoryId: d.id } as CategoryBudget)), snap.metadata.fromCache, false); },
      () => { if (alive && useAuthStore.getState().user?.uid === uid) cb([], true, true); });
    return () => { alive = false; stop(); };
  },
  async getAll(uid: string): Promise<CategoryBudget[]> {
    if (useAuthStore.getState().user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
    const snapshot = await getDocsFromServer(collection(getFirebaseFirestore()!, 'users', uid, CATEGORY_BUDGETS_COLLECTION));
    if (useAuthStore.getState().user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
    return snapshot.docs.map(d => ({ ...d.data(), categoryId: d.id } as CategoryBudget));
  },
  async save(uid: string, budget: CategoryBudget | null, categoryId: string, expectedAt: number | null): Promise<void> {
    await commitBudget(uid, budget, categoryId, expectedAt);
  },
  async restore(uid: string, budget: CategoryBudget | null, categoryId: string): Promise<void> {
    await commitBudget(uid, budget, categoryId);
  },
};
async function commitBudget(uid: string, budget: CategoryBudget | null, categoryId: string, expectedAt?: number | null) {
  if (useAuthStore.getState().user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
  if (budget && (!validCategoryBudget(budget) || budget.categoryId !== categoryId)) throw new Error('INVALID_BUDGET');
  const db = getFirebaseFirestore()!;
  const ref = doc(db, 'users', uid, CATEGORY_BUDGETS_COLLECTION, categoryId);
  // Transactions bypass disableNetwork in the Web SDK; explicitly require server coverage.
  await getDocFromServer(ref);
  await runTransaction(db, async tx => {
    if (useAuthStore.getState().user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
    const old = await tx.get(ref);
    const revision = old.exists() ? old.data().updatedAt : null;
    if (expectedAt !== undefined && revision !== expectedAt) throw new Error('BUDGET_CONFLICT');
    if (!budget) tx.delete(ref);
    else tx.set(ref, {
      monthlyLimit: budget.monthlyLimit,
      warningThresholdPercent: budget.warningThresholdPercent,
      updatedAt: Math.max(Date.now(), (revision ?? 0) + 1),
    });
  });
}

export function categoryBudgetProgress(budgets: CategoryBudget[], categories: Category[], expenses: Expense[]) {
  const cats = new Map(categories.filter(c => c.transactionType === 'expense' && !c.migrationState).map(c => [c.id, c]));
  const spent = new Map<string, number>();
  for (const e of expenses) if (!e.deleted && e.transactionType === 'expense') spent.set(e.categoryId, (spent.get(e.categoryId) ?? 0) + toMinorUnits(e.amount));
  return budgets.filter(b => cats.has(b.categoryId)).map(b => {
    const limit = toMinorUnits(b.monthlyLimit), used = spent.get(b.categoryId) ?? 0;
    return { ...b, category: cats.get(b.categoryId)!, spent: used / 100, remaining: Math.max(0, limit - used) / 100,
      overspent: Math.max(0, used - limit) / 100, percent: used * 100 / limit,
      state: used > limit ? 'over' : used === limit ? 'reached' : used * 100 >= limit * b.warningThresholdPercent ? 'warning' : 'normal' };
  }).sort((a,b) => b.percent - a.percent || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0));
}
export function budgetAllocation(budgets: CategoryBudget[], global: number | null) {
  const total = budgets.reduce((n,b) => n + toMinorUnits(b.monthlyLimit), 0), limit = global == null ? null : toMinorUnits(global);
  return { total: total / 100, unallocated: limit == null ? null : Math.max(0, limit-total)/100, overAllocated: limit == null ? 0 : Math.max(0,total-limit)/100 };
}
