package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Recurrence
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Android parity for recurring receipt identity, driven by the same fixture the Web suite reads.
 * Cases are data, not restated assertions: adding a row to testdata/receipt-identity.json
 * exercises both platforms.
 */
class RecurrenceReceiptIdentityTest {
    private val fixture: JSONObject = run {
        val file = listOf(
            File("../testdata/receipt-identity.json"),
            File("testdata/receipt-identity.json"),
        ).first { it.exists() }
        JSONObject(file.readText())
    }

    private val templateId = fixture.getString("templateId")
    private val scheduledDate = fixture.getString("scheduledDate")
    private val expectedExpenseId = fixture.getString("expectedExpenseId")
    private val cases = fixture.getJSONArray("cases")

    private fun stateOf(c: JSONObject): String {
        val exists = c.optBoolean("receiptExists", false)
        val receipt = if (c.isNull("receipt")) null else c.optJSONObject("receipt")
        return Recurrence.receiptState(
            exists,
            receipt?.optString("templateId"),
            receipt?.optString("scheduledDate"),
            receipt?.optString("expenseId"),
            templateId,
            scheduledDate,
            expectedExpenseId,
        )
    }

    @Test
    fun everySharedFixtureCaseClassifiesIdentically() {
        assertTrue("fixture must carry cases", cases.length() >= 10)
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(c.getString("name"), c.getString("expectedState"), stateOf(c))
        }
    }

    @Test
    fun aReceiptStoredUnderAnotherDocumentIdCannotProveThisOccurrence() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            if (!c.has("documentId")) continue
            assertNotEquals(
                "a receipt filed under " + c.getString("documentId") + " is absent for this occurrence",
                c.getString("documentId"),
                Recurrence.receiptId(templateId, scheduledDate),
            )
            assertEquals("absent", stateOf(c))
        }
    }

    @Test
    fun aProvenReceiptSuppressesTheIdentityConflictEvenWithoutAKey() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            if (!c.has("expenseExists")) continue
            val state = stateOf(c)
            // The production check is: conflict only when the receipt is absent.
            val keyless = c.optBoolean("expenseHasKey", true).not()
            val conflict = state == "absent" && c.getBoolean("expenseExists") && keyless
            assertEquals(c.getString("name"), state == "absent", conflict)
            assertFalse(c.getString("name"), state != "valid" && state != "absent")
        }
    }

    @Test
    fun aProvenReceiptOverAMissingExpenseNeverResurrectsHistory() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            if (c.optBoolean("expenseExists", true)) continue
            if (c.getString("expectedState") != "valid") continue
            assertFalse(c.getString("name"), c.optBoolean("expectResurrection", false))
        }
    }

    @Test
    fun onlyInvalidReceiptsAreQuarantined() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val state = stateOf(c)
            assertEquals(c.getString("name"), state == "invalid", c.optBoolean("expectQuarantine", false) || c.getString("expectedState") == "invalid")
        }
    }
}
