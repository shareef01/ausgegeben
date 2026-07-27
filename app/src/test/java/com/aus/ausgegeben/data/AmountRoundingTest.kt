package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.round

/**
 * Mirrors AppRepository.roundAmount — keep in sync with repository helper.
 * Tests the money-rounding contract without standing up Firestore.
 */
class AmountRoundingTest {

    @Test
    fun roundAmount_roundsHalfUpToTwoDecimals() {
        assertEquals(1.24, roundAmount(1.235), 0.0)
        assertEquals(1.24, roundAmount(1.244), 0.0)
        assertEquals(10.0, roundAmount(9.999), 0.0)
        assertEquals(0.0, roundAmount(0.001), 0.0)
    }

    @Test
    fun roundAmount_preservesExactCents() {
        assertEquals(12.34, roundAmount(12.34), 0.0)
    }

    /** Same formula as AppRepository.roundAmount. */
    private fun roundAmount(value: Double): Double = round(value * 100.0) / 100.0
}
