package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CurrencyUtilsTest {

    @Test
    fun formatAmount_eurUsesGermanSeparators() {
        assertEquals("1.234,56", CurrencyUtils.formatAmount(1234.56, "EUR"))
    }

    @Test
    fun formatAmount_usdUsesUsSeparators() {
        assertEquals("$1,234.56", CurrencyUtils.formatAmount(1234.56, "USD", showSymbol = true))
    }

    @Test
    fun parseAmount_respectsDecimalSeparator() {
        assertEquals(12.5, CurrencyUtils.parseAmount("12,50", "EUR")!!, 0.001)
        assertEquals(12.5, CurrencyUtils.parseAmount("12.50", "USD")!!, 0.001)
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
}
