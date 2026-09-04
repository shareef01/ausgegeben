package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Test

class NumericKeypadHelperTest {

    @Test
    fun `initial zero replacement and leading zero prevention`() {
        assertEquals("5", NumericKeypadHelper.handleKeyInput("0", "5", ','))
        assertEquals("0", NumericKeypadHelper.handleKeyInput("0", "0", ','))
        assertEquals("0,", NumericKeypadHelper.handleKeyInput("0", ",", ','))
        assertEquals("0.", NumericKeypadHelper.handleKeyInput("0", ".", '.'))
        assertEquals("0,", NumericKeypadHelper.handleKeyInput("", ",", ','))
    }

    @Test
    fun `duplicate decimal separators are prevented`() {
        assertEquals("12,", NumericKeypadHelper.handleKeyInput("12,", ",", ','))
        assertEquals("12.5", NumericKeypadHelper.handleKeyInput("12.5", ".", '.'))
        assertEquals("12,5", NumericKeypadHelper.handleKeyInput("12,5", ".", ','))
        assertEquals("12.5", NumericKeypadHelper.handleKeyInput("12.5", ",", '.'))
    }

    @Test
    fun `decimal places capped at two`() {
        assertEquals("12,34", NumericKeypadHelper.handleKeyInput("12,3", "4", ','))
        // Attempting a third decimal digit should be ignored
        assertEquals("12,34", NumericKeypadHelper.handleKeyInput("12,34", "5", ','))
    }

    @Test
    fun `integer digits capped at nine to prevent overflow`() {
        var amount = "0"
        repeat(9) {
            amount = NumericKeypadHelper.handleKeyInput(amount, "9", ',')
        }
        assertEquals("999999999", amount)

        // 10th integer digit should be rejected
        val overflow = NumericKeypadHelper.handleKeyInput(amount, "9", ',')
        assertEquals("999999999", overflow)

        // But decimal separator can still be added
        val withDecimal = NumericKeypadHelper.handleKeyInput(amount, ",", ',')
        assertEquals("999999999,", withDecimal)

        // And two decimal digits can be added
        val withDec1 = NumericKeypadHelper.handleKeyInput(withDecimal, "9", ',')
        val withDec2 = NumericKeypadHelper.handleKeyInput(withDec1, "9", ',')
        assertEquals("999999999,99", withDec2)
    }

    @Test
    fun `backspace drops last character or returns zero`() {
        assertEquals("12", NumericKeypadHelper.handleBackspace("123"))
        assertEquals("12", NumericKeypadHelper.handleBackspace("12,"))
        assertEquals("0", NumericKeypadHelper.handleBackspace("5"))
        assertEquals("0", NumericKeypadHelper.handleBackspace("0"))
        assertEquals("0", NumericKeypadHelper.handleBackspace(""))
    }
}
