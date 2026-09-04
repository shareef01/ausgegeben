package com.aus.ausgegeben.util

/**
 * Robust sanitizer and validation rules for category names across UI, ViewModel, and Repository layers.
 * Prevents raw shorthand junk (e.g. "aus;", "shpn;"), pure symbol strings (e.g. "--->", ";;;"),
 * control characters, and trailing punctuation artifacts while preserving legitimate international names.
 */
object CategoryValidator {

    private const val MAX_CATEGORY_NAME_LENGTH = 80

    // Leading/trailing junk characters commonly found in malformed inputs or raw shorthand
    private val LEADING_OR_TRAILING_JUNK = Regex("^[\\s;,:_\\-><]+|[\\s;,:_\\-><]+$")
    
    // Multiple consecutive whitespace characters
    private val MULTIPLE_WHITESPACE = Regex("\\s+")

    // Matches valid category names: must start with alphanumeric char,
    // contains valid letters/digits (including Unicode/umlauts) and allowed connectors (&, %, +, -, /, ', (), ., ,, !, ?, etc.).
    // Must contain at least one letter or digit.
    private val VALID_NAME_REGEX = Regex("^[\\p{L}\\p{N}][\\p{L}\\p{N}\\s\\-&%+$€£/'\"().,!?]{0,78}[\\p{L}\\p{N}.)%!?]?$|^[\\p{L}\\p{N}]$")
    private val CONTAINS_ALPHANUMERIC = Regex("[\\p{L}\\p{N}]")

    /**
     * Sanitizes raw category name input:
     * - Strips control characters
     * - Removes leading/trailing junk punctuation (semicolons, colons, arrows, etc.)
     * - Normalizes internal whitespace
     * - Enforces max length bound of 80 characters
     */
    fun sanitize(input: String?): String {
        if (input == null) return ""
        val withoutControlChars = input.filter { !it.isISOControl() }
        val collapsedWhitespace = withoutControlChars.replace(MULTIPLE_WHITESPACE, " ").trim()
        var stripped = collapsedWhitespace.replace(LEADING_OR_TRAILING_JUNK, "").trim()
        // If stripping removed characters, re-run once to catch nested junk (e.g. ";->")
        stripped = stripped.replace(LEADING_OR_TRAILING_JUNK, "").trim()
        return stripped.take(MAX_CATEGORY_NAME_LENGTH)
    }

    /**
     * Validates whether a category name meets data integrity requirements:
     * 1. Sanitized name is not blank
     * 2. Length is within [1, 80]
     * 3. Contains at least one letter or number (rejecting pure punctuation like "--->")
     * 4. Matches allowed category naming pattern
     */
    fun isValid(input: String?): Boolean {
        val sanitized = sanitize(input)
        if (sanitized.isEmpty() || sanitized.length > MAX_CATEGORY_NAME_LENGTH) return false
        if (!CONTAINS_ALPHANUMERIC.containsMatchIn(sanitized)) return false
        return VALID_NAME_REGEX.matches(sanitized)
    }

    /**
     * Characters, not UTF-16 code units — which is what Firestore rules `size()` counts.
     *
     * "🙂".length is 2 but it is one character, so counting code units would reject a name
     * of 50 emoji that the rules accept. This screen exists to avoid a failed write;
     * over-rejecting would make it the very thing it guards against. Erring this way is
     * also the safe direction: if the rules are stricter, the write just fails at the
     * server exactly as it did before the screen existed.
     */
    private fun charCount(value: String): Int = value.codePointCount(0, value.length)

    /**
     * Whether firestore.rules validCategory() would accept this document.
     *
     * Deliberately mirrors the rule bounds rather than [isValid]'s name policy: a legacy
     * category can carry a name this validator dislikes that the rules accept happily,
     * and rejecting those here would freeze rows the server is fine with.
     *
     * A reorder is one atomic batch across every category in a type — correctly, since a
     * per-document retry would leave the type half-renumbered, which is worse than either
     * order. The cost of that atomicity is that a single row the rules refuse takes the
     * whole batch with it, so reordering fails permanently with a generic message and no
     * way to tell which row is at fault. Screening first turns that into a nameable row.
     * Mirrors web isRulesWritableCategory().
     */
    fun isRulesWritable(
        name: String?,
        iconName: String?,
        colorInt: Int,
        transactionType: String?,
        sortOrder: Int,
    ): Boolean {
        if (name == null || name.isEmpty() || charCount(name) > 80) return false
        if (iconName == null || iconName.isEmpty() || charCount(iconName) >= 64) return false
        // colorInt is an Int, so the rules' int32 bounds hold by construction.
        if (transactionType !in setOf("expense", "income", "transfer")) return false
        return sortOrder in 0 until 10000
    }
}
