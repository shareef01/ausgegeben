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
    fun roundAmount(amount: Double): Double = Math.round(amount * 100.0) / 100.0

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

    /**
     * Currency-aware parse. Matches web `parseAmount`: a lone separator with 1–2
     * trailing digits is always a decimal (so `"12.50"` is 12.5 even for EUR),
     * while three digits after the grouping separator are thousands.
     */
    fun parseAmount(input: String, currencyCode: String = "EUR"): Double? {
        val cleaned = input.trim().filter { it.isDigit() || it == '.' || it == ',' || it == '-' }
        if (cleaned.isEmpty()) return null
        val decimal = decimalSeparator(currencyCode)
        val grouping = if (decimal == ',') '.' else ','
        val lastDot = cleaned.lastIndexOf('.')
        val lastComma = cleaned.lastIndexOf(',')
        val normalized = when {
            lastDot != -1 && lastComma != -1 -> {
                val dec = if (lastDot > lastComma) '.' else ','
                val other = if (dec == '.') ',' else '.'
                cleaned.replace(other.toString(), "").replace(dec, '.')
            }
            lastDot != -1 || lastComma != -1 -> {
                val sep = if (lastDot != -1) '.' else ','
                val last = maxOf(lastDot, lastComma)
                val repeated = cleaned.indexOf(sep) != last
                val digitsAfter = cleaned.length - last - 1
                if (repeated || (sep == grouping && digitsAfter == 3)) {
                    cleaned.replace(sep.toString(), "")
                } else {
                    cleaned.replace(sep, '.')
                }
            }
            else -> cleaned
        }
        return normalized.toDoubleOrNull()
    }
}
