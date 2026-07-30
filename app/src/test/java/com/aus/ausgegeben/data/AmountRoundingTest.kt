package com.aus.ausgegeben.data

import com.aus.ausgegeben.util.CurrencyUtils
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Exercises the real money-rounding helper that AppRepository writes and InsightsViewModel
 * totals both go through. This used to assert against a private copy of the formula declared
 * in this file, so it could not fail if the production helper ever changed.
 */
class AmountRoundingTest {

    @Test
    fun roundAmount_roundsHalfUpToTwoDecimals() {
        assertEquals(1.24, CurrencyUtils.roundAmount(1.235), 0.0)
        assertEquals(1.24, CurrencyUtils.roundAmount(1.244), 0.0)
        assertEquals(10.0, CurrencyUtils.roundAmount(9.999), 0.0)
        assertEquals(0.0, CurrencyUtils.roundAmount(0.001), 0.0)
    }

    @Test
    fun roundAmount_preservesExactCents() {
        assertEquals(12.34, CurrencyUtils.roundAmount(12.34), 0.0)
    }

    @Test
    fun roundAmount_collapsesFloatingPointArtefacts() {
        // What unrounded Double addition produces in analytics totals.
        assertEquals(0.3, CurrencyUtils.roundAmount(0.1 + 0.2), 0.0)
        assertEquals(105.3, CurrencyUtils.roundAmount(35.1 * 3), 0.0)
    }
}
