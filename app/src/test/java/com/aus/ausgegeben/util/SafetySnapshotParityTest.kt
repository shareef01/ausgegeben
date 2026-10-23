package com.aus.ausgegeben.util

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Android half of the safety-snapshot parity contract (AUD-006).
 *
 * Loads `testdata/safety-snapshot-parity.json` — the *same file* the web suite reads in
 * `web/src/services/safetySnapshot.parity.test.ts` — so the two strict readers cannot drift on
 * which snapshot payloads are recoverable. Only the error *path* is compared, never the
 * human-readable reason, so each language may word it differently.
 *
 * Written because reviewing the two implementations side by side showed two real divergences:
 * the web reader accepted a `colorInt` outside 32 bits, and it accepted a recurring template
 * whose `nextDate` disagreed with its `nextIndex`. Both are rejected by the rules at write time,
 * so both clients must reject them here rather than hand a rollback a row it cannot write.
 */
class SafetySnapshotParityTest {

    private val fixture: JSONObject = JSONObject(
        checkNotNull(javaClass.classLoader!!.getResourceAsStream("safety-snapshot-parity.json"))
            .bufferedReader()
            .use { it.readText() },
    )

    @Test
    fun `every shared case reaches the same decision as the web reader`() {
        val cases = fixture.getJSONArray("cases")
        assertTrue("fixture has no cases", cases.length() > 0)
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val name = case.getString("name")
            val payload = asMap(case.get("payload"))
            val expect = case.getString("expect")
            when (expect) {
                "accept" -> {
                    val result = apply(case.getString("section"), payload)
                    if (case.has("count")) {
                        assertEquals("$name: expected count", case.getInt("count"), sizeOf(result))
                    } else {
                        assertTrue("$name: expected a non-null result", result != null)
                    }
                }
                "reject" -> {
                    val expectedPath = case.getString("path")
                    try {
                        apply(case.getString("section"), payload)
                        fail("$name: expected the reader to refuse this payload")
                    } catch (e: SafetySnapshot.InvalidSnapshotException) {
                        assertTrue(
                            "$name: refusal was \"${e.message}\", expected path \"$expectedPath\"",
                            e.message.orEmpty().contains("SNAPSHOT_INVALID: $expectedPath:"),
                        )
                    }
                }
                else -> fail("$name: unknown expect \"$expect\"")
            }
        }
    }

    /** Mirrors the dispatch in the web suite one-for-one. */
    private fun apply(section: String, payload: Map<String, Any?>): Any? = when (section) {
        "categories" -> SafetySnapshot.categories(payload)
        "expenses" -> SafetySnapshot.expenses(payload, "chunk_0") { emptyMap() }
        "budgets" -> SafetySnapshot.budgets(payload)
        "templates" -> SafetySnapshot.templates(payload)
        "preferences" -> SafetySnapshot.preferences(payload)
        "receipts" -> SafetySnapshot.receipts(payload["recurringReceipts"], "meta.recurringReceipts")
        "counts" -> SafetySnapshot.requireCount(
            payload["declared"], (payload["actual"] as Number).toInt(), "meta.totalExpenses",
        )
        "chunkCount" -> SafetySnapshot.chunkCount(payload, "chunkCount")
        else -> throw AssertionError("unknown section \"$section\"")
    }

    private fun sizeOf(result: Any?): Int = when (result) {
        null -> 0
        is Collection<*> -> result.size
        is Number -> result.toInt()
        else -> throw AssertionError("cannot take a size of ${result::class.simpleName}")
    }

    // org.json has no null literal; JSONObject.NULL has to become a Kotlin null for the reader
    // to see the same shape a Firestore snapshot would produce.
    private fun asMap(value: Any?): Map<String, Any?> = when (val converted = convert(value)) {
        is Map<*, *> -> converted.entries.associate { it.key as String to it.value }
        null -> emptyMap()
        else -> throw AssertionError("payload must be an object, got ${converted::class.simpleName}")
    }

    private fun convert(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> value.keys().asSequence().associateWith { convert(value.get(it)) }
        is JSONArray -> (0 until value.length()).map { convert(value.get(it)) }
        else -> value
    }
}
