package com.aus.ausgegeben.util

/**
 * Keypad input processor for financial amounts.
 * Prevents multiple decimal separators, unhandled leading zeros, integer and decimal overflow.
 */
object NumericKeypadHelper {

    const val MAX_INTEGER_DIGITS = 9
    const val MAX_DECIMAL_DIGITS = 2

    /**
     * Processes a single key press against the current keypad state.
     *
     * @param current The current amount string displayed (e.g. "0", "12,50", "")
     * @param input The key pressed (e.g. "1", "0", ",", ".", "back")
     * @param decimalSeparator The localized decimal separator for the active currency
     * @return The updated amount string
     */
    fun handleKeyInput(current: String, input: String, decimalSeparator: Char): String {
        val sepStr = decimalSeparator.toString()
        val isDecimalInput = input == sepStr || input == "." || input == ","
        val hasDecimal = current.contains(decimalSeparator) || current.contains('.') || current.contains(',')

        if (isDecimalInput) {
            if (hasDecimal) return current // Prevent duplicate decimal separators
            return if (current.isEmpty() || current == "0") "0$decimalSeparator" else "$current$decimalSeparator"
        }

        // Processing digit input (0-9)
        if (input.length == 1 && input[0].isDigit()) {
            if (current == "0") {
                return if (input == "0") "0" else input
            }
            if (current.isEmpty()) {
                return input
            }

            if (hasDecimal) {
                val separatorIndex = current.indexOfFirst { it == decimalSeparator || it == '.' || it == ',' }
                val decimals = current.substring(separatorIndex + 1)
                if (decimals.length >= MAX_DECIMAL_DIGITS) {
                    return current // Decimal overflow guard (max 2 decimals)
                }
                return current + input
            } else {
                if (current.length >= MAX_INTEGER_DIGITS) {
                    return current // Integer overflow guard (max 9 digits before decimal)
                }
                return current + input
            }
        }

        return current
    }

    /**
     * Handles backspace action on the keypad.
     */
    fun handleBackspace(current: String): String {
        return if (current.length > 1) {
            current.dropLast(1)
        } else {
            "0"
        }
    }
}
