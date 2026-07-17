package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Test

class ExportUtilsTest {

    @Test
    fun csvEscapeField_leavesSimpleValuesUntouched() {
        assertEquals("Food", ExportUtils.csvEscapeField("Food"))
    }

    @Test
    fun csvEscapeField_quotesCommasAndNewlines() {
        assertEquals("\"Coffee, tea\"", ExportUtils.csvEscapeField("Coffee, tea"))
        assertEquals("\"Say \"\"hi\"\"\"", ExportUtils.csvEscapeField("Say \"hi\""))
    }

    @Test
    fun csvEscapeField_neutralizesFormulaTriggers() {
        assertEquals("'=SUM(A1:A9)", ExportUtils.csvEscapeField("=SUM(A1:A9)"))
        assertEquals("'+491234", ExportUtils.csvEscapeField("+491234"))
        assertEquals("'-groceries", ExportUtils.csvEscapeField("-groceries"))
        assertEquals("'@home", ExportUtils.csvEscapeField("@home"))
        assertEquals("\"'=1,2\"", ExportUtils.csvEscapeField("=1,2"))
    }
}
