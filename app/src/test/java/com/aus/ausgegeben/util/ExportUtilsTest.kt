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
}
