package com.aus.ausgegeben.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object CurrencyUtils {
    val supportedCurrencies = listOf("EUR", "USD", "GBP", "CHF")

    private val symbolsByCode = mapOf(
        "EUR" to "€",
        "USD" to "$",
        "GBP" to "£",
        "CHF" to "CHF"
    )

    private val localeByCurrency = mapOf(
        "EUR" to Locale.GERMANY,
        "USD" to Locale.US,
        "GBP" to Locale.UK,
        "CHF" to Locale.forLanguageTag("de-CH")
    )

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
        showSymbol: Boolean = false
    ): String {
        val locale = localeFor(currencyCode)
        val symbols = DecimalFormatSymbols(locale)
        val formatted = DecimalFormat("#,##0.00", symbols).format(amount)
        if (!showSymbol) return formatted
        val symbol = symbolFor(currencyCode)
        return when (currencyCode) {
            "CHF" -> "$symbol $formatted"
            "USD", "GBP" -> "$symbol$formatted"
            else -> "$formatted $symbol"
        }
    }

    fun formatAmountForInput(amount: Double, currencyCode: String = "EUR"): String {
        val locale = localeFor(currencyCode)
        val symbols = DecimalFormatSymbols(locale).apply {
            groupingSeparator = '\u0000'
        }
        return DecimalFormat("0.##", symbols).format(amount)
    }

    fun parseAmount(input: String, currencyCode: String = "EUR"): Double? {
        val sep = decimalSeparator(currencyCode)
        val otherSep = if (sep == ',') '.' else ','
        return input.trim()
            .replace(otherSep.toString(), "")
            .replace(sep, '.')
            .toDoubleOrNull()
    }
}
