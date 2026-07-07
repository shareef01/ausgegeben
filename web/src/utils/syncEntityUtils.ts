import type { Category, Expense } from '@/models/types';

export function newCloudId(): string {
  return crypto.randomUUID();
}

export function ensureCloudId<T extends { cloudId?: string }>(item: T): T & { cloudId: string } {
  return { ...item, cloudId: item.cloudId?.trim() || newCloudId() };
}

export function stampedForSync<T extends { cloudId?: string; updatedAt?: number; pendingSync?: boolean }>(
  item: T,
): T & { cloudId: string; updatedAt: number; pendingSync: true } {
  const withId = ensureCloudId(item);
  return {
    ...withId,
    updatedAt: Date.now(),
    pendingSync: true,
  };
}

export function stampedCategory(category: Omit<Category, 'id' | 'cloudId' | 'updatedAt' | 'pendingSync'> & Partial<Pick<Category, 'cloudId'>>): Category {
  return stampedForSync(category as Category);
}

export function stampedExpense(expense: Omit<Expense, 'id' | 'cloudId' | 'updatedAt' | 'pendingSync'> & Partial<Pick<Expense, 'cloudId'>>): Expense {
  return stampedForSync(expense as Expense);
}
