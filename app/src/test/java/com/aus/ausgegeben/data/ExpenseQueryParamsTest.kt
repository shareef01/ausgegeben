package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ExpenseQueryParamsTest {

    @Test
    fun forPeriod_buildsSearchPattern() {
        val params = ExpenseQueryParams.forPeriod(
            startMillis = 0L,
            endMillis = 100L,
            typeFilter = TransactionTypeFilterKey.EXPENSE,
            searchQuery = " Coffee ",
        )
        assertEquals(0L, params.startMillis)
        assertEquals(100L, params.endMillis)
        assertEquals("expense", params.typeFilter)
        assertEquals("%coffee%", params.searchPattern)
    }

    @Test
    fun forPeriod_blankSearchUsesEmptyPattern() {
        val params = ExpenseQueryParams.forPeriod(0L, 1L, searchQuery = "   ")
        assertEquals("", params.searchPattern)
        assertEquals("", params.typeFilter)
    }
}
