package com.aus.ausgegeben.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object CurrencyUtils {
    val supportedCurrencies = listOf("EUR", "USD", "GBP", "CHF")

    /**
     * 2-decimal precision for money. Single source of truth so repository writes, analytics
     * totals, and AmountRoundingTest all exercise the same formula — the test used to assert
     * against a private copy of it, so it could not catch a change here.
     */
    fun toMinorUnits(amount: Double): Long = Math.round(amount * 100.0)
    fun fromMinorUnits(minor: Long): Double = minor / 100.0
    fun roundAmount(amount: Double): Double = fromMinorUnits(toMinorUnits(amount))

    private val symbolsByCode = mapOf(
        "EUR" to "€",
        "USD" to "$",
        "GBP" to "£",
        "CHF" to "CHF"
    )

    /** Currency→locale for input parsing only — matches web `decimalSeparatorFor`. */
    private val localeByCurrency = mapOf(
        "EUR" to Locale.GERMANY,
        "USD" to Locale.US,
        "GBP" to Locale.UK,
        "CHF" to Locale.forLanguageTag("de-CH")
    )

    /** App language for display — matches web `formatAmount` (not currency→locale). */
    fun localeForLanguage(language: String): Locale = when (language) {
        "de" -> Locale.GERMANY
        else -> Locale.US
    }

    fun localeForDisplay(language: String? = null): Locale =
        localeForLanguage(language ?: Locale.getDefault().language.let { if (it == "de") "de" else "en" })

    fun localeFor(currencyCode: String): Locale =
        localeByCurrency[currencyCode] ?: Locale.getDefault()

    fun symbolFor(currencyCode: String): String =
        symbolsByCode[currencyCode] ?: currencyCode

    fun labelFor(currencyCode: String): String =
        "$currencyCode (${symbolFor(currencyCode)})"

    fun decimalSeparator(currencyCode: String): Char =
        DecimalFormatSymbols(localeFor(currencyCode)).decimalSeparator

    fun formatAmount(
        amount: Double,
        currencyCode: String = "EUR",
        showSymbol: Boolean = false,
        language: String? = null,
    ): String {
        val locale = localeForDisplay(language)
        if (!showSymbol) {
            val symbols = DecimalFormatSymbols(locale)
            return DecimalFormat("#,##0.00", symbols).format(amount)
        }
        val fmt = java.text.NumberFormat.getCurrencyInstance(locale) as DecimalFormat
        fmt.currency = java.util.Currency.getInstance(currencyCode)
        return fmt.format(amount)
    }

    /**
     * Prefill string for the amount field when editing an existing transaction.
     *
     * Always two decimals. The pattern was "0.##", which drops trailing zeros, so a
     * stored 12.50 prefilled as "12,5" here and "12,50" on web -- the same transaction
     * rendering differently depending on which client opened it. Both re-parse
     * correctly, so nothing was miscalculated; it was a visible parity gap.
     * Matches web formatAmountForInput (toFixed(2)); asserted by MoneyParityTest.
     */
    fun formatAmountForInput(amount: Double, currencyCode: String = "EUR"): String {
        val locale = localeFor(currencyCode)
        val symbols = DecimalFormatSymbols(locale).apply {
            groupingSeparator = '\u0000'
        }
        return DecimalFormat("0.00", symbols).format(amount)
    }

    private val DOT_GROUPED = Regex("""\d{1,3}(\.\d{3})+""")
    private val COMMA_GROUPED = Regex("""\d{1,3}(,\d{3})+""")

    /**
     * Strict, currency-aware parse. The same rules as web `parseAmount`, pinned for both
     * by testdata/money-parity.json:
     *
     * - Only digits, "." and "," after trimming; any letter, sign, symbol or inner space
     *   rejects the whole input (`"12abc"` and `"1-2"` are null, not 12 or 1).
     * - With both separators, the later one is the decimal point.
     * - A lone separator that repeats, or is the currency's grouping separator followed
     *   by exactly three digits, is thousands grouping; otherwise it is the decimal point,
     *   so `"12.50"` is 12.5 even for EUR.
     * - Grouping must be well formed and at most two decimals are allowed, so ambiguous
     *   input such as `"1,234"` for EUR is refused rather than guessed. A trailing decimal
     *   separator (`"12,"`) is accepted, for half-typed input.
     */
    fun parseAmount(input: String, currencyCode: String = "EUR"): Double? {
        val s = input.trim()
        if (s.isEmpty() || s.any { !(it in '0'..'9' || it == '.' || it == ',') } || s.none { it in '0'..'9' }) {
            return null
        }
        val lastDot = s.lastIndexOf('.')
        val lastComma = s.lastIndexOf(',')
        var intPart = s
        var fraction: String? = null
        var grouping: Char? = null
        if (lastDot != -1 && lastComma != -1) {
            val dec = if (lastDot > lastComma) '.' else ','
            val decAt = s.indexOf(dec)
            if (decAt != s.lastIndexOf(dec)) return null
            intPart = s.substring(0, decAt)
            fraction = s.substring(decAt + 1)
            grouping = if (dec == '.') ',' else '.'
        } else if (lastDot != -1 || lastComma != -1) {
            val sep = if (lastDot != -1) '.' else ','
            val last = maxOf(lastDot, lastComma)
            val repeated = s.indexOf(sep) != last
            val currencyGrouping = if (decimalSeparator(currencyCode) == ',') '.' else ','
            if (repeated || (sep == currencyGrouping && s.length - last - 1 == 3)) {
                grouping = sep
            } else {
                intPart = s.substring(0, last)
                fraction = s.substring(last + 1)
            }
        }
        if (grouping != null) {
            val wellGrouped = if (grouping == '.') DOT_GROUPED else COMMA_GROUPED
            if (!wellGrouped.matches(intPart)) return null
            intPart = intPart.replace(grouping.toString(), "")
        }
        if (intPart.any { it !in '0'..'9' }) return null
        if (fraction != null && (fraction.length > 2 || fraction.any { it !in '0'..'9' })) return null
        if (intPart.isEmpty() && fraction.isNullOrEmpty()) return null
        return "${intPart.ifEmpty { "0" }}.${fraction.orEmpty().ifEmpty { "0" }}".toDoubleOrNull()
    }
}

/** Sum in integer cents so thousands of valid rows cannot accumulate binary drift. */
fun Iterable<Double>.sumMoney(): Double =
    CurrencyUtils.fromMinorUnits(fold(0L) { total, amount -> total + CurrencyUtils.toMinorUnits(amount) })

fun Sequence<Double>.sumMoney(): Double =
    CurrencyUtils.fromMinorUnits(fold(0L) { total, amount -> total + CurrencyUtils.toMinorUnits(amount) })
