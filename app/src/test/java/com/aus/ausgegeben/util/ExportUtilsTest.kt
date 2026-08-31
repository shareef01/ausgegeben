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

    /**
     * The expectations here are byte-for-byte the ones asserted on the web side in
     * analytics.test.ts ("exportCsv renders amounts with exactly two decimals"). Double
     * .toString() would give "5.0", "1234.5" and "1.0E9" for these inputs, none of which
     * match what the web client writes for the same expense.
     */
    @Test
    fun formatAmountCell_matchesWebTwoDecimalRendering() {
        assertEquals("5.00", ExportUtils.formatAmountCell(5.0))
        assertEquals("9.50", ExportUtils.formatAmountCell(9.5))
        assertEquals("0.01", ExportUtils.formatAmountCell(0.01))
        assertEquals("1234.50", ExportUtils.formatAmountCell(1234.5))
        // Never scientific notation inside the range the rules permit (amount < 1e9).
        assertEquals("999999999.00", ExportUtils.formatAmountCell(999999999.0))
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
