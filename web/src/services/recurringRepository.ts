import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { RECURRING_COLLECTION, OCCURRENCES_COLLECTION } from '@/repositories/firestorePaths';
import { expenseDocumentId } from '@/utils/idempotency';
import { expenseWritePayload } from '@/utils/firestorePayloads';
import { MAX_OCCURRENCES_PER_PASS, indexAfter, localDateAt, occurrenceDate, occurrenceKey, occurrenceMillis, receiptId, validTemplate, type RecurringTemplate } from './recurrence';

function owned(uid: string) {
  const user = useAuthStore.getState().user;
  if (user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
  if (!user.emailVerified) throw new Error('EMAIL_NOT_VERIFIED');
}
export function createRecurringRepository(database?: Firestore) {
function db() { const value = database ?? getFirebaseFirestore(); if (!value) throw new Error('FIRESTORE_UNAVAILABLE'); return value; }
function ref(uid: string, id: string) { return doc(db(), 'users', uid, RECURRING_COLLECTION, id); }
function category(uid: string, id: string) { return doc(db(), 'users', uid, 'categories', id); }
function eligible(data: Record<string, unknown> | undefined, type: string) {
  if (!data || data.deletionState === 'deleting' || data.migrationState === 'migrating' || data.transactionType !== type) throw new Error('RECURRING_CATEGORY_UNAVAILABLE');
}
return {
  observe(uid: string, cb: (rows: RecurringTemplate[], incomplete: boolean, error: boolean) => void) {
    let alive = true;
    const stop = onSnapshot(collection(db(), 'users', uid, RECURRING_COLLECTION), { includeMetadataChanges: true }, snap => {
      if (alive && useAuthStore.getState().user?.uid === uid) cb(snap.docs.map(d => ({ ...d.data(), id: d.id } as RecurringTemplate)), snap.metadata.fromCache, false);
    }, () => { if (alive && useAuthStore.getState().user?.uid === uid) cb([], true, true); });
    return () => { alive = false; stop(); };
  },
  async getAll(uid: string) {
    owned(uid);
    const snap = await getDocsFromServer(collection(db(), 'users', uid, RECURRING_COLLECTION));
    owned(uid); return snap.docs.map(d => ({ ...d.data(), id: d.id } as RecurringTemplate));
  },
  async save(uid: string, template: RecurringTemplate, expectedAt: number | null, now = Date.now()) {
    template = { ...template, nextDate: occurrenceDate(template, template.nextIndex) };
    owned(uid); if (!validTemplate(template)) throw new Error('INVALID_RECURRING_TEMPLATE');
    const target = ref(uid, template.id);
    await getDocFromServer(target); // Transactions alone can bypass disableNetwork in the Web SDK.
    await runTransaction(db(), async tx => {
      owned(uid);
      const old = await tx.get(target), previous = old.exists() ? { ...old.data(), id: old.id } as RecurringTemplate : null;
      if ((previous?.updatedAt ?? null) !== expectedAt) throw new Error('RECURRING_CONFLICT');
      if (previous && previous.timeZone !== template.timeZone) throw new Error('RECURRING_TIMEZONE_IMMUTABLE');
      const newCategory = category(uid, template.categoryId), newCat = await tx.get(newCategory);
      eligible(newCat.data(), template.transactionType);
      const oldCategory = previous && previous.categoryId !== template.categoryId ? category(uid, previous.categoryId) : null;
      const oldCat = oldCategory ? await tx.get(oldCategory) : null;
      let next = template;
      if (previous) {
        const pauseOnly = previous.enabled && !template.enabled && ['amount','categoryId','note','transactionType','frequency','interval','startDate','endDate'].every(k => previous[k as keyof RecurringTemplate] === template[k as keyof RecurringTemplate]);
        const nextIndex = pauseOnly ? previous.nextIndex : indexAfter(template, localDateAt(now, template.timeZone));
        next = { ...template, nextIndex, nextDate: occurrenceDate(template, nextIndex), createdAt: previous.createdAt };
      }
      owned(uid);
      if (!previous || previous.categoryId !== template.categoryId) tx.update(newCategory, { recurringTemplateCount: (newCat.data()?.recurringTemplateCount ?? 0) + 1, recurringMutationId: template.id });
      if (oldCategory) tx.update(oldCategory, { recurringTemplateCount: Math.max(0, (oldCat!.data()?.recurringTemplateCount ?? 0) - 1), recurringMutationId: template.id });
      const { id, ...payload } = { ...next, updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1) }; void id;
      tx.set(target, payload);
    });
  },
  async remove(uid: string, id: string, expectedAt: number) {
    owned(uid); const target = ref(uid, id); await getDocFromServer(target);
    await runTransaction(db(), async tx => {
      owned(uid); const old = await tx.get(target);
      if (!old.exists() || old.data().updatedAt !== expectedAt) throw new Error('RECURRING_CONFLICT');
      const catRef = category(uid, old.data().categoryId), cat = await tx.get(catRef);
      owned(uid);
      tx.update(catRef, { recurringTemplateCount: Math.max(0, (cat.data()?.recurringTemplateCount ?? 0) - 1), recurringMutationId: id });
      tx.delete(target);
    });
  },
  /** Public single-occurrence operation for SDK-backed race/retry tests; ignores stale input. */
  async materialize(uid: string, id: string, now = Date.now()): Promise<RecurringTemplate | null> {
    owned(uid); const target = ref(uid, id); await getDocFromServer(target);
    let attempted: { date: string; revision: number } | null = null;
    try { return await runTransaction(db(), async tx => {
      owned(uid); const snap = await tx.get(target); if (!snap.exists()) return null;
      const template = { ...snap.data(), id } as RecurringTemplate;
      if (!validTemplate(template)) throw new Error('INVALID_RECURRING_TEMPLATE');
      const date = template.nextDate;
      if (!template.enabled || date === null || date > localDateAt(now, template.timeZone)) return null;
      attempted = { date, revision: template.updatedAt };
      const key = occurrenceKey(id, date), expenseId = await expenseDocumentId(key);
      const occurrence = doc(db(), 'users', uid, OCCURRENCES_COLLECTION, receiptId(id, date));
      const expense = doc(db(), 'users', uid, 'expenses', expenseId);
      const [receipt, existing, cat] = await Promise.all([tx.get(occurrence), tx.get(expense), tx.get(category(uid, template.categoryId))]);
      eligible(cat.data(), template.transactionType); owned(uid);
      if (existing.exists() && existing.data().idempotencyKey !== key) throw new Error("RECURRING_IDENTITY_CONFLICT");
      if (!receipt.exists()) {
        if (!existing.exists()) tx.set(expense, expenseWritePayload({ id: expenseId, amount: template.amount, categoryId: template.categoryId, note: template.note, transactionType: template.transactionType, dateMillis: occurrenceMillis(date, template.timeZone) }, { idempotencyKey: key, updatedAt: now }));
        tx.set(occurrence, { templateId: id, scheduledDate: date, expenseId, createdAt: now });
      }
      const nextIndex = template.nextIndex + 1, nextDate = occurrenceDate(template, nextIndex);
      const updated = { ...template, nextIndex, nextDate, updatedAt: Math.max(now, template.updatedAt + 1) };
      tx.update(target, { nextIndex, nextDate, updatedAt: updated.updatedAt });
      return updated;
    }); } catch (error) {
      // The emulator can evaluate rules for a losing optimistic write before its
      // version precondition. Accept only a server-confirmed completed occurrence.
      const attempt = attempted as { date: string; revision: number } | null;
      if (attempt && typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied') {
        owned(uid);
        const [fresh, receipt] = await Promise.all([getDocFromServer(target), getDocFromServer(doc(db(), 'users', uid, OCCURRENCES_COLLECTION, receiptId(id, attempt.date)))]);
        owned(uid);
        const next = fresh.exists() ? { ...fresh.data(), id } as RecurringTemplate : null;
        if (next && validTemplate(next) && next.updatedAt > attempt.revision && next.nextDate !== attempt.date && receipt.exists()) return next;
      }
      throw error;
    }
  },
  async reconcile(uid: string, now = Date.now()) {
    const templates = await this.getAll(uid);
    let count = 0;
    // A fixed bound caps both network work and scans, without any history queries.
    for (let attempt = 0; attempt < MAX_OCCURRENCES_PER_PASS; attempt++) {
      let due: RecurringTemplate | undefined;
      for (const t of templates) {
        if (t.enabled && t.nextDate && t.nextDate <= localDateAt(now, t.timeZone) && (!due || t.nextDate < due.nextDate! || t.nextDate === due.nextDate && t.id < due.id)) due = t;
      }
      if (!due) break;
      const next = await this.materialize(uid, due.id, now);
      const index = templates.findIndex(t => t.id === due.id);
      if (next) { templates[index] = next; count++; } else templates.splice(index, 1);
    }
    return count;
  },
};

}
export const recurringRepository = createRecurringRepository();
