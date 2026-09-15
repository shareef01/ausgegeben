import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Expense, TransactionType } from '@/models/types';
import { expenseRepository, EmailNotVerifiedError, UNCATEGORIZED_ID } from '@/repositories/expenseRepository';
import { formatAmount, formatAmountForInput, parseAmount, sanitizeAmountInput } from '@/utils/currency';
import { thisMonthRange } from '@/utils/periodUtils';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import {
  beginExpenseSubmission,
  completeExpenseSubmission,
} from '@/services/expenseSubmissionJournal';

export interface AddTransactionForm {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string | null;
  note: string;
  dateMillis: number;
}

export type SaveResult = { ok: false } | { ok: true; budgetAlert?: string };

const defaultForm = (): AddTransactionForm => ({
  amountInput: '',
  transactionType: 'expense',
  categoryId: null,
  note: '',
  dateMillis: Date.now(),
});

/**
 * The categories the picker may offer for `type`.
 *
 * Exported and shared with [isStoredCategorySelectable] on purpose: the silent
 * re-categorisation bug existed because "what the picker shows" and "is the stored
 * category acceptable" were two separately-written conditions that drifted. They are
 * now one predicate, so they cannot disagree again.
 */
export function selectableCategoriesFor<T extends Pick<Category, 'id' | 'transactionType' | 'name'>>(
  cats: T[],
  type: TransactionType,
): T[] {
  return cats.filter(
    (c) => c.transactionType === type && Boolean(c.name?.trim()) && c.id !== UNCATEGORIZED_ID,
  );
}

/**
 * Whether a stored `categoryId` is one the user could have picked.
 *
 * False for the Uncategorized sentinel and for an orphan whose category was deleted.
 * Both cases must block the save rather than resolve to a substitute — writing a guessed
 * category is a silent edit to data the user never touched.
 */
export function isStoredCategorySelectable(
  cats: Pick<Category, 'id' | 'transactionType' | 'name'>[],
  type: TransactionType,
  categoryId: string | null,
): boolean {
  if (!categoryId) return false;
  return selectableCategoriesFor(cats, type).some((c) => c.id === categoryId);
}

/**
 * Writes one expense — a new document (minting a fresh operation id) or an update to
 * `expenseId` — and best-effort clears its journal entry on success. Exported so
 * regression tests exercise the exact write path `save()` uses (including against a
 * real Firestore emulator), separate from the React-only concerns (`saving`/`error`
 * state, i18n) that stay in the hook.
 */
export async function writeExpense(params: {
  uid: string | undefined;
  expenseId?: string;
  payload: Omit<Expense, 'id'>;
}): Promise<string> {
  const { uid, expenseId, payload } = params;
  if (expenseId) {
    await expenseRepository.updateExpense({ ...payload, id: expenseId });
    return expenseId;
  }
  if (!uid) throw new Error('Not signed in');
  // A fresh operation id per explicit Save tap — never derived from the field
  // values — so two genuinely distinct transactions can never be collapsed into
  // one, even if every field happens to match. Persisted before Firestore is
  // called so a crash between the write landing and this journal entry being
  // cleared is reconciled (not resubmitted) on next sign-in; see ensureSeeded().
  const prepared = await beginExpenseSubmission(uid);
  const savedId = await expenseRepository.insertExpense(payload, prepared.operationId);
  try {
    await completeExpenseSubmission(prepared);
  } catch (journalError) {
    // The financial write is already acknowledged. Keeping the journal is safer
    // than reporting a false save failure: a retry will resolve to the same doc.
    console.warn('[useAddTransactionViewModel] could not clear submission journal', journalError);
  }
  return savedId;
}

/**
 * Runs `fn` only if `guardRef.current` is not already true, claiming it synchronously
 * first — before `fn`'s first `await` — so a second, overlapping call (e.g. a rapid
 * double-tap on Save, invoked before React has committed `setSaving(true)`) is
 * rejected before it ever mints an operation id or touches Firestore. React state
 * cannot provide this lock on its own: a `setState` update is not synchronously
 * visible to another invocation made in the same event turn (B2).
 *
 * `guardRef` must be scoped to one mounted add-transaction flow (created once via
 * `useRef`, never a module-level value) — a shared guard would serialize unrelated
 * flows against each other. It only ever suppresses a genuinely *overlapping* call on
 * the same flow; once `fn` has settled (success or failure) the guard is released in
 * `finally`, so a later, sequential call — even an explicit resubmission with an
 * identical payload — is always allowed. That boundary is deliberate: this guards
 * against accidental double-invocation, not against the user intentionally entering
 * two identical transactions one after another (DATA-1 already covers that; see
 * expenseSubmissionJournal.ts) — do not fold content-based checks into this guard.
 *
 * Exported so tests exercise this exact mechanism directly, including against a real
 * Firestore emulator, rather than a re-implementation of it.
 */
export async function runExclusive<T>(
  guardRef: { current: boolean },
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'overlapping' }> {
  if (guardRef.current) return { ok: false, reason: 'overlapping' };
  guardRef.current = true;
  try {
    return { ok: true, value: await fn() };
  } finally {
    guardRef.current = false;
  }
}

export function useAddTransactionViewModel(expenseId?: string) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AddTransactionForm>(defaultForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Edit load failed (missing doc / fetch error) — block Save so we never recreate the id. */
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * The transaction type the category selection was last reconciled against.
   *
   * Switching type must reset the chosen category, but "the stored category is not
   * selectable" is a different condition entirely and must NOT resolve to a guess.
   * Keying the reset off the *rendered* list instead of an actual type change meant
   * opening any transaction whose category was the Uncategorized sentinel or an orphan
   * silently refiled it under whichever category happened to sort first — the user
   * edited a note and the categorisation changed underneath them. Android has never
   * done this: loadForEdit leaves the selection null and saveExpense refuses.
   *
   * Seeded from the loaded expense so arriving on an income row does not read as the
   * user having just switched to income.
   */
  const reconciledType = useRef<TransactionType>(defaultForm().transactionType);

  /** Stored category exists but is not selectable (deleted, or the '0' sentinel). */
  const [categoryUnresolved, setCategoryUnresolved] = useState(false);

  /**
   * Synchronous re-entrancy guard for `save()` (B2). Checked and claimed by
   * `runExclusive` before `save`'s first `await`, so a second overlapping
   * invocation — e.g. two Save taps queued before this component re-renders with
   * `saving=true` — is rejected before it can mint an operation id or write to
   * Firestore. Deliberately a `useRef`, not a module-level value: it must be scoped
   * to this one mounted add-transaction flow, never shared across instances.
   */
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const CATEGORY_TIMEOUT_MS = 8000;
      const catsPromise = expenseRepository.getAllCategories();
      const timeoutPromise = new Promise<Category[]>((_, reject) =>
        setTimeout(() => reject(new Error('Category load timed out')), CATEGORY_TIMEOUT_MS)
      );
      const cats = await Promise.race([catsPromise, timeoutPromise]);
      setCategories(cats);
      if (expenseId) {
        const existing = await expenseRepository.getExpenseById(expenseId);
        if (existing) {
          // Seed the reconciliation ref before the state commit so the effect below
          // does not read this load as a user-initiated type switch and reset the
          // category we just restored.
          reconciledType.current = existing.transactionType;
          const selectable = isStoredCategorySelectable(
            cats,
            existing.transactionType,
            existing.categoryId,
          );
          setCategoryUnresolved(!selectable);
          if (!selectable) setError(t('errorChooseCategory'));
          setForm({
            amountInput: formatAmountForInput(existing.amount, usePreferencesStore.getState().currency),
            transactionType: existing.transactionType,
            categoryId: existing.categoryId,
            note: existing.note,
            dateMillis: existing.dateMillis,
          });
        } else {
          // The expense was deleted elsewhere (another tab/device) between opening this
          // edit view and this fetch. Without this branch the form silently stayed blank
          // with no error, and Save would happily recreate a new document under the
          // (now stale) expenseId with only the freshly-typed fields — a data-loss-adjacent
          // bug. Surface the same load-failure copy used below so the user sees an error
          // instead of a deceptively empty "Edit Transaction" form.
          setError(t('errorLoadFailed'));
          setLoadFailed(true);
        }
      } else {
        const first = cats.find((c) => c.transactionType === 'expense');
        setForm({ ...defaultForm(), categoryId: first?.id ?? null });
      }
      setReady(true);
    } catch (err) {
      console.error('[useAddTransactionViewModel] load failed', err);
      setReady(true);
      setError(t('errorLoadFailed'));
      setLoadFailed(Boolean(expenseId));
    }
  }, [expenseId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(
    () => selectableCategoriesFor(categories, form.transactionType),
    [categories, form.transactionType],
  );

  useEffect(() => {
    if (reconciledType.current === form.transactionType) return;
    // A real type switch: the previous category belongs to the old type, so pick the
    // first of the new one. Only this transition may replace the user's choice.
    reconciledType.current = form.transactionType;
    setCategoryUnresolved(false);
    setForm((f) => ({ ...f, categoryId: filteredCategories[0]?.id ?? null }));
  }, [form.transactionType, filteredCategories]);

  /** Clear the unresolved flag once the user picks a real category. */
  useEffect(() => {
    if (categoryUnresolved && filteredCategories.some((c) => c.id === form.categoryId)) {
      setCategoryUnresolved(false);
      setError(null);
    }
  }, [categoryUnresolved, filteredCategories, form.categoryId]);

  const appendDigit = (digit: string) => {
    setForm((f) => {
      const currency = usePreferencesStore.getState().currency;
      return { ...f, amountInput: sanitizeAmountInput(f.amountInput + digit, currency) };
    });
  };

  const backspace = () => setForm((f) => ({ ...f, amountInput: f.amountInput.slice(0, -1) }));

  const setAmountInput = (value: string) => {
    const currency = usePreferencesStore.getState().currency;
    setForm((f) => ({ ...f, amountInput: sanitizeAmountInput(value, currency) }));
  };

  const checkBudgetAlert = async (
    type: TransactionType,
    newAmount: number,
    excludeExpenseId?: string,
  ): Promise<string | undefined> => {
    if (type !== 'expense') return undefined;
    const { monthlyBudget, currency } = usePreferencesStore.getState();
    if (!monthlyBudget || monthlyBudget <= 0) return undefined;
    const [start, end] = thisMonthRange();
    // Exclude the just-saved expense so we can project spent + newAmount without double-counting.
    const spent = await expenseRepository.sumMonthExpenses(start, end, excludeExpenseId);
    const projected = spent + newAmount;
    if (projected <= monthlyBudget) return undefined;
    return t('errorBudgetExceeded', {
      spent: formatAmount(projected, currency),
      budget: formatAmount(monthlyBudget, currency),
    });
  };

  const save = async (): Promise<SaveResult> => {
    if (loadFailed) {
      setError(t('errorLoadFailed'));
      return { ok: false };
    }
    const amount = parseAmount(form.amountInput, usePreferencesStore.getState().currency);
    if (!amount || amount <= 0) {
      setError(t('errorValidAmount'));
      return { ok: false };
    }
    if (!form.categoryId || categoryUnresolved) {
      // categoryUnresolved: the stored category is the Uncategorized sentinel or points
      // at a deleted one. Refuse rather than substituting — writing a guessed category
      // here is a silent edit to data the user never touched (Android parity).
      setError(t('errorChooseCategory'));
      return { ok: false };
    }
    const payload: Omit<Expense, 'id'> = {
      amount,
      categoryId: form.categoryId,
      note: form.note.trim(),
      dateMillis: form.dateMillis,
      transactionType: form.transactionType,
    };
    // Everything from here down runs inside runExclusive's guard (B2): a second,
    // overlapping call to save() reaching this point while this one is still in
    // flight is rejected before it is ever invoked — it never touches setSaving,
    // never mints an operation id, never calls Firestore. This deliberately does
    // NOT reject a later, sequential save (even an identical one) — the guard is
    // released in runExclusive's finally the moment this attempt settles.
    const attempt = await runExclusive(savingRef, async (): Promise<SaveResult> => {
      setSaving(true);
      setError(null);
      try {
        const uid = useAuthStore.getState().user?.uid;
        const savedId = await writeExpense({ uid, expenseId, payload });
        // Budget check is best-effort — a failed projection must not look like a failed save.
        let budgetAlert: string | undefined;
        try {
          budgetAlert = await checkBudgetAlert(form.transactionType, amount, savedId);
        } catch (err) {
          console.error('[useAddTransactionViewModel] budget check failed', err);
          budgetAlert = t('errorBudgetCheckFailed');
        }
        return { ok: true, budgetAlert };
      } catch (err) {
        console.error('[useAddTransactionViewModel] save failed', err);
        if (err instanceof Error && err.message === 'EXPENSE_NOT_FOUND') {
          setLoadFailed(true);
          setError(t('errorLoadFailed'));
        } else {
          setError(err instanceof EmailNotVerifiedError ? t('authVerifyRequired') : t('errorSaveFailed'));
        }
        return { ok: false };
      } finally {
        setSaving(false);
      }
    });
    // attempt can only be `{ ok: false, reason: 'overlapping' }` here, never a
    // Firestore/validation failure — those are already turned into `SaveResult`
    // values inside the guarded callback above. An overlapping, redundant
    // invocation reports failure quietly: the in-flight attempt it collided with
    // owns showing success or failure for this logical save.
    return attempt.ok ? attempt.value : { ok: false };
  };

  const reloadCategories = useCallback(async () => {
    try {
      const cats = await expenseRepository.getAllCategories();
      setCategories(cats);
    } catch (err) {
      console.error('[useAddTransactionViewModel] reloadCategories failed', err);
    }
  }, []);

  return {
    form,
    setForm,
    categories: filteredCategories,
    ready,
    appendDigit,
    backspace,
    setAmountInput,
    save,
    saving,
    error,
    loadFailed,
    /** True while the stored category is the Uncategorized sentinel or an orphan. */
    categoryUnresolved,
    isEditing: Boolean(expenseId),
    reloadCategories,
    reload: load,
  };
}
