import type { TransactionType } from '@/models/types';
import { parseAmount } from '@/utils/currency';

/**
 * Unsaved-changes detection for the add/edit transaction form.
 *
 * The form used to decide "dirty" by asking whether *any* field looked filled in,
 * which only works for a blank new transaction — an edited transaction is dirty the
 * moment it loads, so the discard guard was skipped entirely for edits and a stray
 * backdrop tap or Escape threw the user's changes away silently. Comparing against
 * the values that were loaded is what makes the same guard correct for both flows.
 *
 * The comparison deliberately ignores presentation-only differences:
 * - amounts are compared by parsed value, so re-typing `12,50` as `12.50` is not a change;
 * - notes are trimmed, so stray whitespace is not a change;
 * - dates are compared by local calendar day, because the date field is day-precision
 *   and selection may set a different time-of-day for the same day.
 */
export interface TransactionDraft {
  amountInput: string;
  transactionType: TransactionType;
  categoryId: string | null;
  note: string;
  dateMillis: number;
}

/** Local calendar day key (`YYYY-MM-DD`) — stable across time-of-day differences. */
export function localDayKey(millis: number): string {
  const d = new Date(millis);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function amountValue(input: string, currency: string): number {
  return parseAmount(input, currency) ?? 0;
}

export function isTransactionDraftDirty(
  baseline: TransactionDraft | null,
  draft: TransactionDraft,
  currency: string,
): boolean {
  // Before the form's own values are known, nothing can be lost: never prompt.
  if (!baseline) return false;
  if (amountValue(draft.amountInput, currency) !== amountValue(baseline.amountInput, currency)) {
    return true;
  }
  if (draft.transactionType !== baseline.transactionType) return true;
  if ((draft.categoryId ?? null) !== (baseline.categoryId ?? null)) return true;
  if (draft.note.trim() !== baseline.note.trim()) return true;
  return localDayKey(draft.dateMillis) !== localDayKey(baseline.dateMillis);
}
