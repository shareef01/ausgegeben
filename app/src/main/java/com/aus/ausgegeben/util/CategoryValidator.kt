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
}
