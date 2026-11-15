import type { Category, Expense } from '@/models/types';

function roundAmount(amt: number): number {
  return Math.round(amt * 100) / 100;
}

/**
 * Allowlisted category write. Mirrors Android AppRepository.categoryPayload():
 * never spread a Firestore snapshot — legacy keys (cloudId, deleted) stay on the
 * document via merge, and unknown extras must not be sent (rules hasOnly).
 */
export function categoryWritePayload(
  cat: Pick<Category, 'name' | 'iconName' | 'colorInt' | 'transactionType' | 'sortOrder'> & {
    id?: string;
  },
  updatedAt: number,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: cat.name.trim().slice(0, 80),
    iconName: cat.iconName,
    colorInt: cat.colorInt,
    transactionType: cat.transactionType,
    sortOrder: cat.sortOrder,
    updatedAt,
  };
  if (cat.id) payload.id = cat.id;
  return payload;
}

/**
 * Allowlisted expense write. Mirrors Android AppRepository.expensePayload().
 */
export function expenseWritePayload(
  expense: Pick<Expense, 'amount' | 'dateMillis' | 'categoryId' | 'note' | 'transactionType'> & {
    id?: string;
  },
  opts?: { updatedAt?: number; idempotencyKey?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amount: roundAmount(expense.amount),
    dateMillis: expense.dateMillis,
    categoryId: expense.categoryId,
    note: expense.note.trim().slice(0, 2000),
    transactionType: expense.transactionType,
    updatedAt: opts?.updatedAt ?? Date.now(),
  };
  if (expense.id) payload.id = expense.id;
  if (opts?.idempotencyKey) payload.idempotencyKey = opts.idempotencyKey;
  return payload;
}

const EDITABLE_EXPENSE_FIELDS = ['amount', 'dateMillis', 'categoryId', 'note', 'transactionType'] as const;

/** 'number' | 'string' | 'missing' | other typeof: a legacy row can hold the wrong shape. */
function valueKind(value: unknown): string {
  if (value === undefined || value === null) return 'missing';
  return typeof value;
}

/**
 * The fields an edit must write (AUS-104).
 *
 * An edit used to send the whole row, so two devices editing different fields of one
 * transaction lost one of the changes: A changes the note, B changes the amount, and
 * whichever saved second wrote its stale copy of the other field too. Now an edit sends
 * only what changed against the values the editor loaded ([original]). Firestore's
 * update merges, so the other device's field survives. Edits to the same field are
 * still last-writer-wins.
 *
 * - A field is also sent when its stored value is missing or has the wrong type (a
 *   legacy row), because the full write used to normalize that shape.
 * - categoryId and transactionType travel together: rules require them to match, and
 *   sending one alone could pair it with a type the other device just changed.
 * - With no [original] (callers that don't track one), every field is sent, as before.
 *
 * Inputs are canonical payloads from expenseWritePayload; [stored] is the raw document.
 * The result may be empty: nothing changed, so there is nothing to write.
 */
export function expenseUpdatePatch(
  edited: Record<string, unknown>,
  original: Record<string, unknown> | null,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_EXPENSE_FIELDS) {
    const changed = original === null || edited[key] !== original[key];
    const legacyShape = valueKind(stored[key]) !== valueKind(edited[key]);
    if (changed || legacyShape) patch[key] = edited[key];
  }
  if ('categoryId' in patch || 'transactionType' in patch) {
    patch.categoryId = edited.categoryId;
    patch.transactionType = edited.transactionType;
  }
  return patch;
}
