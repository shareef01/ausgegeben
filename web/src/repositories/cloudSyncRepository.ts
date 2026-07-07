import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { Category, Expense, SyncedPreferences } from '@/models/types';
import { patchCategoryUpdatedAt, patchExpenseUpdatedAt } from '@/services/database';
import { newCloudId } from '@/utils/syncEntityUtils';
import {
  dedupeLegacyCategoryDocs,
  dedupeLegacyExpenseDocs,
  type DedupedPull,
  type FirestorePulledDoc,
} from '@/utils/legacyFirestoreDedup';

export interface CloudCategory extends Omit<Category, 'id'> {
  updatedAt: number;
  deleted?: boolean;
}

export interface CloudExpense extends Omit<Expense, 'id'> {
  categoryCloudId: string;
  updatedAt: number;
  deleted?: boolean;
}

function categoriesRef(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'categories');
}

function expensesRef(db: Firestore, uid: string) {
  return collection(db, 'users', uid, 'expenses');
}

function categoryDoc(db: Firestore, uid: string, cloudId: string) {
  return doc(db, 'users', uid, 'categories', cloudId);
}

function expenseDoc(db: Firestore, uid: string, cloudId: string) {
  return doc(db, 'users', uid, 'expenses', cloudId);
}

function preferencesDoc(db: Firestore, uid: string) {
  return doc(db, 'users', uid, 'preferences', 'settings');
}

function firestoreMillis(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value
    && typeof value === 'object'
    && 'toMillis' in value
    && typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

function resolveCloudId(docId: string, data: Record<string, unknown>): string {
  const fromData = data.cloudId;
  if (typeof fromData === 'string' && fromData.length > 0) return fromData;
  if (docId.length >= 32 && docId.includes('-')) return docId;
  if (docId.length > 0) return docId;
  return newCloudId();
}

function categoryWritePayload(category: Category, deleted = false) {
  return {
    cloudId: category.cloudId,
    name: category.name,
    iconName: category.iconName,
    colorInt: toFirestoreColorInt(category.colorInt),
    transactionType: category.transactionType,
    sortOrder: category.sortOrder,
    updatedAt: serverTimestamp(),
    deleted,
  };
}

function expenseWritePayload(
  expense: Expense,
  categoryCloudId: string,
  deleted = false,
) {
  return {
    cloudId: expense.cloudId,
    amount: expense.amount,
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    categoryCloudId,
    note: expense.note ?? '',
    receiptImagePath: cloudSafeReceiptPath(expense.receiptImagePath) ?? '',
    transactionType: expense.transactionType,
    updatedAt: serverTimestamp(),
    deleted,
  };
}

/** Signed 32-bit ARGB — matches Android Room/Firestore color ints. */
function toFirestoreColorInt(value: number): number {
  const truncated = Math.trunc(value);
  if (truncated > 0x7fffffff) return truncated - 0x1_0000_0000;
  return truncated;
}

/**
 * Firestore rules only accept receipt paths that use the portable `receipt://` scheme. Any other
 * path is dropped (sent as null) so a single legacy record can't fail the whole sync.
 */
function cloudSafeReceiptPath(path: string | null | undefined): string | null {
  return path && path.startsWith('receipt://') ? path : null;
}

function parseCategory(docId: string, data: Record<string, unknown>): CloudCategory {
  return {
    cloudId: resolveCloudId(docId, data),
    name: String(data.name ?? ''),
    iconName: String(data.iconName ?? 'shopping_bag'),
    colorInt: Number(data.colorInt ?? 0xff6a9fd4),
    transactionType: data.transactionType as Category['transactionType'],
    sortOrder: Number(data.sortOrder ?? 0),
    updatedAt: firestoreMillis(data.updatedAt),
    deleted: Boolean(data.deleted),
  };
}

function parseExpense(docId: string, data: Record<string, unknown>): CloudExpense | null {
  const cloudId = resolveCloudId(docId, data);
  if (data.deleted === true) {
    return {
      cloudId,
      amount: 0,
      dateMillis: 0,
      categoryId: Number(data.categoryId ?? 0),
      categoryCloudId: String(data.categoryCloudId ?? ''),
      note: '',
      receiptImagePath: null,
      transactionType: 'expense',
      updatedAt: firestoreMillis(data.updatedAt),
      deleted: true,
    };
  }

  const legacyCategoryId = Number(data.categoryId ?? 0);
  const resolvedCategoryCloudId = typeof data.categoryCloudId === 'string' && data.categoryCloudId.length > 0
    ? data.categoryCloudId
    : legacyCategoryId > 0
      ? String(legacyCategoryId)
      : '';
  if (!resolvedCategoryCloudId) return null;

  return {
    cloudId,
    amount: Number(data.amount ?? 0),
    dateMillis: Number(data.dateMillis ?? 0),
    categoryId: legacyCategoryId,
    categoryCloudId: resolvedCategoryCloudId,
    note: String(data.note ?? ''),
    receiptImagePath: data.receiptImagePath ? String(data.receiptImagePath) : null,
    transactionType: data.transactionType as Expense['transactionType'],
    updatedAt: firestoreMillis(data.updatedAt, firestoreMillis(data.dateMillis)),
    deleted: Boolean(data.deleted),
  };
}

export const cloudSyncRepository = {
  async pushCategory(db: Firestore, uid: string, category: Category): Promise<number> {
    const ref = categoryDoc(db, uid, category.cloudId);
    await setDoc(ref, categoryWritePayload(category), { merge: true });
    const snap = await getDoc(ref);
    return firestoreMillis(snap.data()?.updatedAt);
  },

  async pushExpense(
    db: Firestore,
    uid: string,
    expense: Expense,
    categoryCloudId: string,
  ): Promise<number> {
    const ref = expenseDoc(db, uid, expense.cloudId);
    await setDoc(ref, expenseWritePayload(expense, categoryCloudId), { merge: true });
    const snap = await getDoc(ref);
    return firestoreMillis(snap.data()?.updatedAt);
  },

  async tombstoneCategory(db: Firestore, uid: string, category: Category): Promise<number> {
    const ref = categoryDoc(db, uid, category.cloudId);
    await setDoc(
      ref,
      { deleted: true, updatedAt: serverTimestamp() },
      { merge: true },
    );
    const snap = await getDoc(ref);
    return firestoreMillis(snap.data()?.updatedAt);
  },

  async tombstoneExpense(db: Firestore, uid: string, expense: Expense): Promise<number> {
    const ref = expenseDoc(db, uid, expense.cloudId);
    await setDoc(
      ref,
      { deleted: true, updatedAt: serverTimestamp() },
      { merge: true },
    );
    const snap = await getDoc(ref);
    return firestoreMillis(snap.data()?.updatedAt);
  },

  async tombstoneExpenseCloudId(db: Firestore, uid: string, cloudId: string): Promise<void> {
    const ref = expenseDoc(db, uid, cloudId);
    await setDoc(ref, { deleted: true, updatedAt: serverTimestamp() }, { merge: true });
  },

  async tombstoneCategoryCloudId(db: Firestore, uid: string, cloudId: string): Promise<void> {
    const ref = categoryDoc(db, uid, cloudId);
    await setDoc(ref, { deleted: true, updatedAt: serverTimestamp() }, { merge: true });
  },

  async pullCategories(db: Firestore, uid: string, since = 0): Promise<DedupedPull<CloudCategory>> {
    const col = categoriesRef(db, uid);
    const snap = since > 0
      ? await getDocs(query(col, where('updatedAt', '>', Timestamp.fromMillis(since))))
      : await getDocs(col);
    const docs: FirestorePulledDoc<CloudCategory>[] = snap.docs.map((d) => ({
      docId: d.id,
      record: parseCategory(d.id, d.data() as Record<string, unknown>),
    }));
    if (since > 0) {
      return { records: docs.map((item) => item.record), legacyDocIdsToDelete: [], duplicateCloudIds: [], remapCloudIds: {} };
    }
    return dedupeLegacyCategoryDocs(docs);
  },

  async pullExpenses(db: Firestore, uid: string, since = 0): Promise<DedupedPull<CloudExpense>> {
    const col = expensesRef(db, uid);
    const snap = since > 0
      ? await getDocs(query(col, where('updatedAt', '>', Timestamp.fromMillis(since))))
      : await getDocs(col);
    const docs: FirestorePulledDoc<CloudExpense>[] = snap.docs
      .map((d) => {
        const record = parseExpense(d.id, d.data() as Record<string, unknown>);
        return record ? { docId: d.id, record } : null;
      })
      .filter((item): item is FirestorePulledDoc<CloudExpense> => item != null);
    if (since > 0) {
      return { records: docs.map((item) => item.record), legacyDocIdsToDelete: [], duplicateCloudIds: [], remapCloudIds: {} };
    }
    return dedupeLegacyExpenseDocs(docs);
  },

  async deleteLegacyDocs(
    db: Firestore,
    uid: string,
    collectionName: 'categories' | 'expenses',
    docIds: string[],
  ): Promise<void> {
    if (docIds.length === 0) return;
    const col = collectionName === 'categories' ? categoriesRef(db, uid) : expensesRef(db, uid);
    await Promise.all(docIds.map((docId) => deleteDoc(doc(col, docId))));
  },

  /**
   * Tombstones content-duplicate docs (by cloudId) so every device converges on the
   * canonical copy on its next incremental pull.
   */
  async tombstoneCloudIds(
    db: Firestore,
    uid: string,
    collectionName: 'categories' | 'expenses',
    cloudIds: string[],
  ): Promise<void> {
    if (cloudIds.length === 0) return;
    const { getDoc } = await import('firebase/firestore');
    await Promise.all(
      cloudIds.map(async (cloudId) => {
        const ref = collectionName === 'categories'
          ? categoryDoc(db, uid, cloudId)
          : expenseDoc(db, uid, cloudId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        await setDoc(
          ref,
          { deleted: true, updatedAt: serverTimestamp() },
          { merge: true },
        );
      }),
    );
  },

  async pushPreferences(db: Firestore, uid: string, prefs: SyncedPreferences): Promise<number> {
    const ref = preferencesDoc(db, uid);
    await setDoc(
      ref,
      {
        currency: prefs.currency,
        locale: prefs.locale === 'de' ? 'de' : 'en',
        themeMode: prefs.themeMode,
        dailyReminder: prefs.dailyReminder,
        reminderHour: prefs.reminderHour,
        reminderMinute: prefs.reminderMinute,
        analyticsPeriod: prefs.analyticsPeriod,
        recordListPeriod: prefs.recordListPeriod,
        monthlyBudget: prefs.monthlyBudget,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    const snap = await getDoc(ref);
    return firestoreMillis(snap.data()?.updatedAt);
  },

  async pullPreferences(db: Firestore, uid: string): Promise<SyncedPreferences | null> {
    const snap = await getDoc(preferencesDoc(db, uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      currency: String(data.currency ?? 'EUR'),
      locale: (data.locale ?? 'en') as SyncedPreferences['locale'],
      themeMode: data.themeMode as SyncedPreferences['themeMode'],
      dailyReminder: Boolean(data.dailyReminder ?? true),
      reminderHour: Number(data.reminderHour ?? 19),
      reminderMinute: Number(data.reminderMinute ?? 0),
      analyticsPeriod: String(data.analyticsPeriod ?? 'this_month'),
      recordListPeriod: data.recordListPeriod === 'all_time' ? 'all_time' : 'this_month',
      monthlyBudget: data.monthlyBudget != null ? Number(data.monthlyBudget) : null,
      updatedAt: firestoreMillis(data.updatedAt),
    };
  },

  async pushAll(
    db: Firestore,
    uid: string,
    categories: Category[],
    expenses: Expense[],
    categoryCloudIdByLocalId: Map<number, string>,
  ): Promise<void> {
    await Promise.all([
      ...categories.map(async (category) => {
        const updatedAt = await this.pushCategory(db, uid, category);
        await patchCategoryUpdatedAt(category.cloudId, updatedAt);
      }),
      ...expenses.flatMap((expense) => {
        const categoryCloudId = categoryCloudIdByLocalId.get(expense.categoryId);
        return categoryCloudId
          ? [(async () => {
              const updatedAt = await this.pushExpense(db, uid, expense, categoryCloudId);
              await patchExpenseUpdatedAt(expense.cloudId, updatedAt);
            })()]
          : [];
      }),
    ]);
  },
};
