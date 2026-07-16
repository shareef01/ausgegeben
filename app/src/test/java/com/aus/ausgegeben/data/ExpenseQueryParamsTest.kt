package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ExpenseQueryParamsTest {

    @Test
    fun forPeriod_mapsTypeFilter() {
        val params = ExpenseQueryParams.forPeriod(
            startMillis = 0L,
            endMillis = 100L,
            typeFilter = TransactionTypeFilterKey.EXPENSE,
        )
        assertEquals(0L, params.startMillis)
        assertEquals(100L, params.endMillis)
        assertEquals("expense", params.typeFilter)
    }

    @Test
    fun forPeriod_allUsesEmptyTypeFilter() {
        val params = ExpenseQueryParams.forPeriod(0L, 1L)
        assertEquals("", params.typeFilter)
    }
}
