import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, writeBatch, type Firestore } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { RECURRING_COLLECTION, OCCURRENCES_COLLECTION } from '@/repositories/firestorePaths';
import { expenseDocumentId } from '@/utils/idempotency';
import { expenseWritePayload } from '@/utils/firestorePayloads';
import { assertReceiptIdentities, type OccurrenceReceipt } from './recurringBackupSection';
import { MAX_OCCURRENCES_PER_PASS, indexAfter, localDateAt, occurrenceDate, occurrenceKey, occurrenceMillis, receiptId, validOccurrenceReceipt, validTemplate, type RecurringTemplate } from './recurrence';

function owned(uid: string) {
  const user = useAuthStore.getState().user;
  if (user?.uid !== uid) throw new Error('AUTH_ACCOUNT_CHANGED');
  if (!user.emailVerified) throw new Error('EMAIL_NOT_VERIFIED');
}

/**
 * Why a template was quarantined. Each is permanent for that template until its owner acts,
 * so retrying it on every pass would only stop the templates queued behind it:
 * - `RECURRING_RECEIPT_INVALID`: the stored receipt does not prove this occurrence.
 * - `RECURRING_IDENTITY_CONFLICT`: no receipt, and the occurrence's expense id already holds
 *   a row with a different idempotency key.
 * - `INVALID_RECURRING_TEMPLATE`: the stored template fails validation.
 */
export type RecurringIssueCode = 'RECURRING_RECEIPT_INVALID' | 'RECURRING_IDENTITY_CONFLICT' | 'INVALID_RECURRING_TEMPLATE';

/** A recurring occurrence that cannot be reconciled without the owner's decision. */
export interface RecurringIssue {
  code: RecurringIssueCode;
  templateId: string;
  /** '' when the template is too damaged to name a date. */
  scheduledDate: string;
  /** '' when no occurrence identity could be derived. */
  receiptId: string;
  receiptExpenseId: string;
  expectedExpenseId: string;
}

/**
 * Fail-closed signal for one template that cannot be reconciled without its owner.
 * Its own type (not a bare Error) so `reconcile` can quarantine that single template and
 * keep servicing every other one — it used to abort the whole pass. The message is the
 * issue code, so callers matching on the old plain-Error messages keep working.
 */
export class RecurringIssueError extends Error {
  readonly issue: RecurringIssue;
  constructor(issue: RecurringIssue) {
    super(issue.code);
    this.name = 'RecurringIssueError';
    this.issue = issue;
  }
}

export function isRecurringIssue(error: unknown): error is RecurringIssueError {
  return error instanceof RecurringIssueError;
}

/**
 * Acceptance rule for the optimistic-concurrency fallback in `materialize` (AUD-008).
 *
 * The emulator can refuse a losing optimistic write before it tests the transaction's
 * version precondition. In that case a competing client may already have completed the
 * occurrence, so the fallback re-reads the server and accepts the advance ONLY when the
 * template moved past the attempted date AND the stored receipt proves the canonical
 * identity. An invalid receipt never satisfies this rule, so the original error is
 * re-thrown — a genuine permission failure is never converted into a successful
 * materialization, and a malformed receipt is never treated as completion.
 */
export function materializeFallbackAcceptance(
  templateId: string,
  attempted: { date: string; revision: number },
  receipt: { exists(): boolean; data(): Record<string, unknown> | undefined },
  expectedExpenseId: string,
  fresh: RecurringTemplate | null,
): boolean {
  const proves = receiptState(receipt.exists(), receipt.data(), {
    templateId,
    scheduledDate: attempted.date,
    expenseId: expectedExpenseId,
  }) === 'valid';
  return proves && fresh !== null && validTemplate(fresh)
    && fresh.updatedAt > attempted.revision
    && fresh.nextDate !== attempted.date;
}

/**
 * Decision made by the `permission-denied` catch in `materialize`, extracted so the real
 * error-classification gate can be exercised deterministically (the emulator race that
 * reaches this branch is not reproducible without timing control). `null` means "re-throw
 * the original error": a genuine auth/network/permission failure is never reported as a
 * completed occurrence, and an invalid receipt never authorizes recovery.
 */
export function materializeFallbackRecovery(
  uid: string,
  templateId: string,
  ctx: {
    error: unknown;
    attempted: { date: string; revision: number } | null;
    fresh: RecurringTemplate | null;
    receipt: { exists(): boolean; data(): Record<string, unknown> | undefined };
    expectedExpenseId: string;
  },
): RecurringTemplate | null {
  const isPermissionDenied =
    typeof ctx.error === 'object' && ctx.error !== null
    && 'code' in ctx.error && (ctx.error as { code?: unknown }).code === 'permission-denied';
  if (!isPermissionDenied || ctx.attempted === null) return null;
  owned(uid);
  if (materializeFallbackAcceptance(templateId, ctx.attempted, ctx.receipt, ctx.expectedExpenseId, ctx.fresh)) {
    return ctx.fresh;
  }
  return null;
}

/**
 * Classification of the stored occurrence receipt for one scheduled date.
 *
 * `valid` is the only state that proves the occurrence was generated (Step 2 / AUD-008);
 * `absent` means the occurrence may still be owed; `invalid` is untrusted metadata and is
 * always quarantined. Shared by the primary transaction and the optimistic-concurrency
 * fallback so both paths apply the same rule.
 */
export function receiptState(
  exists: boolean,
  data: Record<string, unknown> | undefined,
  expected: { templateId: string; scheduledDate: string; expenseId: string },
): 'absent' | 'valid' | 'invalid' {
  if (!exists) return 'absent';
  return validOccurrenceReceipt(data ?? {}, expected) ? 'valid' : 'invalid';
}

/** Issues recorded by the most recent reconcile pass, per owner. */
const lastIssuesByOwner = new Map<string, RecurringIssue[]>();
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
      if (!validTemplate(template)) {
        throw new RecurringIssueError({
          code: 'INVALID_RECURRING_TEMPLATE',
          templateId: id,
          scheduledDate: typeof template.nextDate === 'string' ? template.nextDate : '',
          receiptId: '',
          receiptExpenseId: '',
          expectedExpenseId: '',
        });
      }
      const date = template.nextDate;
      if (!template.enabled || date === null || date > localDateAt(now, template.timeZone)) return null;
      attempted = { date, revision: template.updatedAt };
      const key = occurrenceKey(id, date), expenseId = await expenseDocumentId(key);
      const occurrence = doc(db(), 'users', uid, OCCURRENCES_COLLECTION, receiptId(id, date));
      const expense = doc(db(), 'users', uid, 'expenses', expenseId);
      const [receipt, existing, cat] = await Promise.all([tx.get(occurrence), tx.get(expense), tx.get(category(uid, template.categoryId))]);
      eligible(cat.data(), template.transactionType); owned(uid);
      // Identity contract (R6): a receipt is authority only when it names this occurrence's
      // deterministic expense id. Anything else is untrusted metadata — fail closed instead
      // of suppressing the occurrence silently, and never act on the id it records.
      const stored = receiptState(receipt.exists(), receipt.data(), { templateId: id, scheduledDate: date, expenseId });
      if (stored === 'invalid') {
        throw new RecurringIssueError({
          code: 'RECURRING_RECEIPT_INVALID',
          templateId: id,
          scheduledDate: date,
          receiptId: receiptId(id, date),
          receiptExpenseId: String(receipt.data()?.expenseId ?? ''),
          expectedExpenseId: expenseId,
        });
      }
      // AUD-008: a proven receipt is authority for identity, so a generated row that lost its
      // key (edited, category-reassigned, restored) reconciles instead of wedging the template.
      if (stored === 'absent' && existing.exists() && existing.data().idempotencyKey !== key) {
        throw new RecurringIssueError({
          code: 'RECURRING_IDENTITY_CONFLICT',
          templateId: id,
          scheduledDate: date,
          receiptId: receiptId(id, date),
          receiptExpenseId: '',
          expectedExpenseId: expenseId,
        });
      }
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
      // version precondition. Re-read the server and accept only a confirmed, canonical
      // completion; everything else re-throws the original error.
      const attempt = attempted as { date: string; revision: number } | null;
      let freshTemplate: RecurringTemplate | null = null;
      if (attempt && typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied') {
        owned(uid);
        const [fresh, receipt] = await Promise.all([getDocFromServer(target), getDocFromServer(doc(db(), 'users', uid, OCCURRENCES_COLLECTION, receiptId(id, attempt.date)))]);
        owned(uid);
        freshTemplate = fresh.exists() ? { ...fresh.data(), id } as RecurringTemplate : null;
        const expectedExpenseId = await expenseDocumentId(occurrenceKey(id, attempt.date));
        const recovered = materializeFallbackRecovery(uid, id, {
          error, attempted: attempt, fresh: freshTemplate,
          receipt: { exists: () => receipt.exists(), data: () => receipt.data() },
          expectedExpenseId,
        });
        if (recovered) return recovered;
      }
      throw error;
    }
  },
  async reconcile(uid: string, now = Date.now()) {
    const templates = await this.getAll(uid);
    let count = 0;
    const issues: RecurringIssue[] = [];
    const quarantined = new Set<string>();
    // A fixed bound caps both network work and scans, without any history queries.
    for (let attempt = 0; attempt < MAX_OCCURRENCES_PER_PASS; attempt++) {
      let due: RecurringTemplate | undefined;
      for (const t of templates) {
        if (quarantined.has(t.id)) continue;
        if (t.enabled && t.nextDate && t.nextDate <= localDateAt(now, t.timeZone) && (!due || t.nextDate < due.nextDate! || t.nextDate === due.nextDate && t.id < due.id)) due = t;
      }
      if (!due) break;
      let next: RecurringTemplate | null;
      try {
        next = await this.materialize(uid, due.id, now);
      } catch (error) {
        // One unreconcilable occurrence must not stall every other template. Record it,
        // stop retrying this template for the rest of the pass, and keep going.
        if (isRecurringIssue(error)) { issues.push(error.issue); quarantined.add(due.id); continue; }
        throw error;
      }
      const index = templates.findIndex(t => t.id === due.id);
      if (next) { templates[index] = next; count++; } else templates.splice(index, 1);
    }
    lastIssuesByOwner.set(uid, issues);
    return count;
  },
  /**
   * Owner decision for a quarantined occurrence: move the template one occurrence past
   * `scheduledDate` without recording anything. No expense and no receipt are written, so a
   * skip can never create a duplicate; later dates materialize as usual on the next pass.
   *
   * Applies only while the template is still exactly as the owner saw it (`expectedAt`) and
   * still stuck on that date, so two devices can't skip twice and a skip can't land after
   * the template was edited or caught up elsewhere (`RECURRING_CONFLICT`).
   */
  async skipOccurrence(uid: string, templateId: string, scheduledDate: string, expectedAt: number, now = Date.now()) {
    owned(uid); const target = ref(uid, templateId); await getDocFromServer(target);
    await runTransaction(db(), async tx => {
      owned(uid); const snap = await tx.get(target);
      if (!snap.exists()) throw new Error('RECURRING_CONFLICT');
      const template = { ...snap.data(), id: templateId } as RecurringTemplate;
      if (template.updatedAt !== expectedAt || template.nextDate !== scheduledDate) throw new Error('RECURRING_CONFLICT');
      if (!validTemplate(template)) throw new Error('INVALID_RECURRING_TEMPLATE');
      const nextIndex = template.nextIndex + 1;
      owned(uid);
      tx.update(target, { nextIndex, nextDate: occurrenceDate(template, nextIndex), updatedAt: Math.max(now, template.updatedAt + 1) });
    });
    // The skipped issue is resolved; drop it now so the warning doesn't wait for the next pass.
    lastIssuesByOwner.set(uid, (lastIssuesByOwner.get(uid) ?? []).filter(i => !(i.templateId === templateId && i.scheduledDate === scheduledDate)));
  },
  /** Occurrences quarantined by the most recent reconcile pass (owner decision required). */
  getRecurringIssues(uid: string): RecurringIssue[] {
    return [...(lastIssuesByOwner.get(uid) ?? [])];
  },
  async getAllReceipts(uid: string): Promise<OccurrenceReceipt[]> {
    owned(uid);
    const snap = await getDocsFromServer(collection(db(), 'users', uid, OCCURRENCES_COLLECTION));
    owned(uid);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as OccurrenceReceipt));
  },
  async restoreReceipts(uid: string, receipts: OccurrenceReceipt[]) {
    owned(uid);
    if (!receipts.length) return;
    const current = await this.getAllReceipts(uid);
    const existing = new Set(current.map(r => r.id));
    const toWrite = receipts.filter(r => !existing.has(r.id));
    // Backstop for every restore path: a written receipt can never be corrected, so refuse
    // the whole set before the first batch. Receipts already stored (e.g. a rollback
    // re-offering legacy rows) are skipped above and never re-checked.
    await assertReceiptIdentities(toWrite);
    for (let i = 0; i < toWrite.length; i += 400) {
      const chunk = toWrite.slice(i, i + 400);
      const batch = writeBatch(db());
      for (const r of chunk) {
        batch.set(doc(db(), 'users', uid, OCCURRENCES_COLLECTION, r.id), {
          templateId: r.templateId,
          scheduledDate: r.scheduledDate,
          expenseId: r.expenseId,
          createdAt: r.createdAt,
        });
      }
      await batch.commit();
    }
  },
  async restoreTemplate(uid: string, template: RecurringTemplate | null, templateId: string) {
    owned(uid);
    const target = ref(uid, templateId);
    await getDocFromServer(target);
    await runTransaction(db(), async tx => {
      owned(uid);
      const old = await tx.get(target);
      const previous = old.exists() ? ({ ...old.data(), id: old.id } as RecurringTemplate) : null;
      if (!template) {
        if (previous) {
          const catRef = category(uid, previous.categoryId);
          const cat = await tx.get(catRef);
          owned(uid);
          tx.update(catRef, {
            recurringTemplateCount: Math.max(0, (cat.data()?.recurringTemplateCount ?? 0) - 1),
            recurringMutationId: templateId,
          });
          tx.delete(target);
        }
        return;
      }
      if (!validTemplate(template)) throw new Error('INVALID_RECURRING_TEMPLATE');
      const newCategory = category(uid, template.categoryId);
      const newCat = await tx.get(newCategory);
      eligible(newCat.data(), template.transactionType);
      const oldCategory = previous && previous.categoryId !== template.categoryId ? category(uid, previous.categoryId) : null;
      const oldCat = oldCategory ? await tx.get(oldCategory) : null;
      owned(uid);
      if (!previous || previous.categoryId !== template.categoryId) {
        tx.update(newCategory, {
          recurringTemplateCount: (newCat.data()?.recurringTemplateCount ?? 0) + 1,
          recurringMutationId: template.id,
        });
      }
      if (oldCategory) {
        tx.update(oldCategory, {
          recurringTemplateCount: Math.max(0, (oldCat!.data()?.recurringTemplateCount ?? 0) - 1),
          recurringMutationId: template.id,
        });
      }
      const nextCreatedAt = previous ? previous.createdAt : template.createdAt;
      const nextUpdatedAt = Math.max(template.updatedAt, (previous?.updatedAt ?? 0) + 1, Date.now());
      const { id, ...payload } = {
        ...template,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
      };
      void id;
      tx.set(target, payload);
    });
  },
};

}
export const recurringRepository = createRecurringRepository();
