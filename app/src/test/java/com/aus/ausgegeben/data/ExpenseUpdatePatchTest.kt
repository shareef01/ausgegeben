package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** AUS-104: an edit writes only the fields it changed. Mirrors the web tests. */
class ExpenseUpdatePatchTest {

    private val base = mapOf<String, Any?>(
        "amount" to 10.0, "dateMillis" to 1_700_000_000_000L, "categoryId" to "food",
        "note" to "Lunch", "transactionType" to "expense",
    )
    private val stored = base + mapOf("updatedAt" to 5L, "cloudId" to "legacy")

    @Test
    fun sendsOnlyChangedFields() {
        assertEquals(mapOf("note" to "Dinner"), expenseUpdatePatch(base + ("note" to "Dinner"), base, stored))
        assertEquals(mapOf("amount" to 15.0), expenseUpdatePatch(base + ("amount" to 15.0), base, stored))
    }

    @Test
    fun sendsNothingWhenNothingChanged() {
        assertEquals(emptyMap<String, Any?>(), expenseUpdatePatch(base, base, stored))
    }

    @Test
    fun categoryAndTypeTravelTogether() {
        assertEquals(
            mapOf("categoryId" to "eating-out", "transactionType" to "expense"),
            expenseUpdatePatch(base + ("categoryId" to "eating-out"), base, stored),
        )
    }

    @Test
    fun doesNotResendAFieldAnotherDeviceChanged() {
        val server = stored + ("amount" to 15.0)
        assertEquals(mapOf("note" to "Dinner"), expenseUpdatePatch(base + ("note" to "Dinner"), base, server))
    }

    @Test
    fun aLongStoredAmountIsStillANumber() {
        // Firestore reads whole numbers back as Long; that is not a legacy shape.
        val server = stored + ("amount" to 10L)
        assertEquals(mapOf("note" to "Dinner"), expenseUpdatePatch(base + ("note" to "Dinner"), base, server))
    }

    @Test
    fun legacyShapedFieldIsSentEvenIfUnchanged() {
        val legacy = mapOf<String, Any?>("amount" to "10", "dateMillis" to 1_700_000_000_000L, "categoryId" to "food", "transactionType" to "expense")
        assertEquals(
            mapOf("amount" to 10.0, "note" to "Dinner"),
            expenseUpdatePatch(base + ("note" to "Dinner"), base, legacy),
        )
    }

    @Test
    fun withoutAnOriginal_sendsEveryField() {
        assertEquals(base, expenseUpdatePatch(base, null, stored))
    }
}
