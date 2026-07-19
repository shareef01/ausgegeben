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
    fun csvEscapeField_quotesEmbeddedCarriageReturn() {
        // A bare \r (e.g. from old Mac-formatted clipboard text pasted into a note)
        // must be quoted like \n is, otherwise Excel/Sheets treat it as a row break.
        assertEquals("\"line1\rline2\"", ExportUtils.csvEscapeField("line1\rline2"))
        assertEquals("\"line1\r\nline2\"", ExportUtils.csvEscapeField("line1\r\nline2"))
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
