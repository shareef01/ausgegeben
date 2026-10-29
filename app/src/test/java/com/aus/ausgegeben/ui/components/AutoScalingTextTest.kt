package com.aus.ausgegeben.ui.components

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.sp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** [fitOnOneLine] with a fake measurer: every character is as wide as the font size. */
class AutoScalingTextTest {

    private val amount = "1.104.064,70" // 12 characters
    private fun widthOf(style: TextStyle) = (amount.length * style.fontSize.value).toInt()

    @Test
    fun fits_keepsTheRequestedSize() {
        val style = TextStyle(fontSize = 20.sp)
        assertEquals(style, fitOnOneLine(amount, style, maxWidth = 240, minFontSize = 10.sp, ::widthOf))
    }

    @Test
    fun tooWide_shrinksUntilItFits() {
        val fitted = fitOnOneLine(amount, TextStyle(fontSize = 20.sp), maxWidth = 180, minFontSize = 10.sp, ::widthOf)
        assertTrue(widthOf(fitted) <= 180)
        assertTrue("no smaller than needed: ${fitted.fontSize}", fitted.fontSize.value > 13f)
    }

    @Test
    fun neverGoesBelowTheMinimum_soTheTextWrapsInstead() {
        val fitted = fitOnOneLine(amount, TextStyle(fontSize = 20.sp), maxWidth = 60, minFontSize = 12.sp, ::widthOf)
        assertEquals(12f, fitted.fontSize.value, 0.01f)
    }

    @Test
    fun lineHeightScalesWithTheFont() {
        val fitted = fitOnOneLine(amount, TextStyle(fontSize = 20.sp, lineHeight = 24.sp), 120, 10.sp, ::widthOf)
        assertEquals(fitted.fontSize.value * 1.2f, fitted.lineHeight.value, 0.05f)
    }

    @Test
    fun unboundedWidth_isLeftAlone() {
        val style = TextStyle(fontSize = 20.sp)
        assertEquals(style, fitOnOneLine(amount, style, Constraints.Infinity, 10.sp, ::widthOf))
    }

    @Test
    fun wrappedAmounts_breakOnlyAfterGroupSeparators() {
        val zw = '\u200B'
        assertEquals("1.${zw}104.${zw}064,${zw}70", breakAfterGroupSeparators("1.104.064,70"))
        assertEquals("Net: 12", breakAfterGroupSeparators("Net: 12"))
        assertEquals("v2.${zw}1.${zw}7 ok.", breakAfterGroupSeparators("v2.1.7 ok."))
    }
}
