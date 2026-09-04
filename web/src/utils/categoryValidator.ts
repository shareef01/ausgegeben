/**
 * Category validator and sanitizer for Web.
 * Mirrors Android CategoryValidator:
 * - Strips control characters
 * - Removes leading/trailing junk punctuation
 * - Normalizes internal whitespace
 * - Enforces max length bound of 80 characters
 * - Rejects pure punctuation (e.g. "--->", ";;;")
 * - Validates allowed characters (letters, digits, Unicode umlauts, common connectors)
 */
export const MAX_CATEGORY_NAME_LENGTH = 80;

const LEADING_OR_TRAILING_JUNK = /^[\s;,:_\-><]+|[\s;,:_\-><]+$/u;
const MULTIPLE_WHITESPACE = /\s+/g;
const VALID_NAME_REGEX = /^[\p{L}\p{N}][\p{L}\p{N}\s\-&%+$€£/'"().,!?]{0,78}[\p{L}\p{N}.)%!?]?$|^[\p{L}\p{N}]$/u;
const CONTAINS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

export const CategoryValidator = {
  sanitize(input?: string | null): string {
    if (!input) return '';
    // Strip control characters
    const withoutControl = input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    const collapsed = withoutControl.replace(MULTIPLE_WHITESPACE, ' ').trim();
    let stripped = collapsed.replace(LEADING_OR_TRAILING_JUNK, '').trim();
    // Run once more to catch nested junk e.g. ";->"
    stripped = stripped.replace(LEADING_OR_TRAILING_JUNK, '').trim();
    return stripped.slice(0, MAX_CATEGORY_NAME_LENGTH);
  },

  isValid(input?: string | null): boolean {
    const sanitized = CategoryValidator.sanitize(input);
    if (!sanitized || sanitized.length > MAX_CATEGORY_NAME_LENGTH) return false;
    if (!CONTAINS_ALPHANUMERIC.test(sanitized)) return false;
    return VALID_NAME_REGEX.test(sanitized);
  },
};

/**
 * Characters, not UTF-16 code units — which is what Firestore rules `size()` counts.
 *
 * `"🙂".length` is 2 but it is one character, so counting code units here would reject a
 * name of 50 emoji that the rules accept happily. This screen exists to *avoid* a failed
 * write; over-rejecting would make it the very thing it is guarding against. Erring this
 * way is also the safe direction: if the rules turn out to be stricter than this, the
 * write simply fails at the server exactly as it did before the screen existed.
 */
function charCount(value: string): number {
  return [...value].length;
}

export interface WritableCategoryShape {
  id?: string;
  name?: string;
  iconName?: string;
  colorInt?: number;
  transactionType?: string;
  sortOrder?: number;
}

/**
 * Whether `firestore.rules` validCategory() would accept this document.
 *
 * Deliberately mirrors the rule bounds rather than the *name* policy above: a legacy
 * category can carry a name the validator dislikes yet the rules accept, and rejecting
 * those here would freeze rows the server is happy with.
 *
 * This exists because a reorder is one atomic batch covering every category in a type —
 * correctly so, since a per-document retry would leave the type half-renumbered, which is
 * worse than either order. The cost of that atomicity is that one row the rules refuse
 * takes the whole batch with it, so reordering fails permanently with a generic error and
 * no way to tell which row is at fault. Screening first turns that into a nameable row.
 */
export function isRulesWritableCategory(cat: WritableCategoryShape): boolean {
  const name = cat.name;
  if (typeof name !== 'string' || charCount(name) < 1 || charCount(name) > 80) return false;
  const icon = cat.iconName;
  if (typeof icon !== 'string' || charCount(icon) < 1 || charCount(icon) >= 64) return false;
  const color = cat.colorInt;
  if (typeof color !== 'number' || !Number.isFinite(color)) return false;
  if (color < -2147483648 || color > 2147483647) return false;
  if (!['expense', 'income', 'transfer'].includes(cat.transactionType ?? '')) return false;
  const order = cat.sortOrder;
  if (typeof order !== 'number' || !Number.isFinite(order)) return false;
  return order >= 0 && order < 10000;
}
