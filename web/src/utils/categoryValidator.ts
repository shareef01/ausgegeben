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
