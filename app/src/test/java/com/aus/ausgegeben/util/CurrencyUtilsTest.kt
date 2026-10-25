package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CurrencyUtilsTest {

    // Keep in sync with web/src/utils/currency.test.ts parity cases.
    private data class ParityCase(
        val amount: Double,
        val currency: String,
        val language: String,
        val showSymbol: Boolean,
        val expected: String,
    )

    private val parityCases = listOf(
        ParityCase(1234.56, "EUR", "en", false, "1,234.56"),
        ParityCase(1234.56, "EUR", "de", false, "1.234,56"),
    )

    @Test
    fun formatAmount_matchesWebParityTable() {
        parityCases.forEach { case ->
            assertEquals(
                case.expected,
                CurrencyUtils.formatAmount(
                    case.amount,
                    case.currency,
                    showSymbol = case.showSymbol,
                    language = case.language,
                ),
            )
        }
    }

    @Test
    fun formatAmount_usdIncludesSymbolWithEnLocale() {
        val formatted = CurrencyUtils.formatAmount(1234.56, "USD", showSymbol = true, language = "en")
        assertEquals(true, formatted.contains("1,234.56"))
        assertEquals(true, formatted.contains("$"))
    }

    @Test
    fun parseAmount_respectsDecimalSeparator() {
        assertEquals(12.5, CurrencyUtils.parseAmount("12,50", "EUR")!!, 0.001)
        assertEquals(12.5, CurrencyUtils.parseAmount("12.50", "USD")!!, 0.001)
    }

    @Test
    fun parseAmount_treatsLoneForeignSeparatorWith1or2DigitsAsDecimal() {
        // Web parity: "12.50" must not become 1250 for EUR (AUS-021).
        assertEquals(12.5, CurrencyUtils.parseAmount("12.50", "EUR")!!, 0.001)
        assertEquals(12.5, CurrencyUtils.parseAmount("12,50", "USD")!!, 0.001)
        assertEquals(0.5, CurrencyUtils.parseAmount("0,5", "EUR")!!, 0.001)
    }

    @Test
    fun parseAmount_stripsThousandsGrouping() {
        assertEquals(1234.56, CurrencyUtils.parseAmount("1.234,56", "EUR")!!, 0.001)
        assertEquals(1234.56, CurrencyUtils.parseAmount("1,234.56", "USD")!!, 0.001)
        assertEquals(1234.0, CurrencyUtils.parseAmount("1.234", "EUR")!!, 0.001)
    }

    @Test
    fun parseAmount_invalidReturnsNull() {
        assertNull(CurrencyUtils.parseAmount("abc", "EUR"))
    }

    @Test
    fun decimalSeparator_matchesLocale() {
        assertEquals(',', CurrencyUtils.decimalSeparator("EUR"))
        assertEquals('.', CurrencyUtils.decimalSeparator("USD"))
    }

    @Test
    fun sumMoney_spendsABudgetExactlyToTheCent() {
        // RecordScreen's budget bar used sumOf, which lands just above 100.00 here and
        // drew a budget spent exactly to the cent as over budget.
        val amounts = listOf(64.01, 0.04, 35.95)
        org.junit.Assert.assertTrue(amounts.sumOf { it } > 100.0)
        assertEquals(100.0, amounts.sumMoney(), 0.0)
        org.junit.Assert.assertFalse(amounts.sumMoney() > 100.0)
    }

    /**
     * Data-safety contract: the currency setting is a display preference. Switching it
     * reformats the same stored amount — it never rescales or reinterprets it.
     */
    @Test
    fun formatAmount_currencyChangeReformatsWithoutConverting() {
        val stored = 1234.56
        val asEur = CurrencyUtils.formatAmount(stored, "EUR", showSymbol = false, language = "en")
        val asUsd = CurrencyUtils.formatAmount(stored, "USD", showSymbol = false, language = "en")

        assertEquals(asEur, asUsd)
        assertEquals(stored, CurrencyUtils.parseAmount(asEur, "EUR")!!, 0.001)
        assertEquals(stored, CurrencyUtils.parseAmount(asUsd, "USD")!!, 0.001)
    }

    /**
     * There is no per-expense currency or exchange-rate field, so no amount can be
     * silently re-based on a currency change. Adding one requires a real migration.
     */
    @Test
    fun expenseEntityHasNoCurrencyOrRateField() {
        val fields = com.aus.ausgegeben.data.entity.Expense::class.java.declaredFields.map { it.name.lowercase() }
        assertEquals(
            "Expense fields changed: $fields",
            emptyList<String>(),
            fields.filter { it.contains("currency") || it.contains("rate") || it.contains("convert") },
        )
    }
}
