package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

/**
 * UX-1 regression suite for the Android transaction editor (parity with the web
 * `addTransactionDirty.test.ts`).
 *
 * The bug this replaces: the close guard asked "does this form look non-empty?", so a loaded
 * edit always looked unsaved, edits had to be excluded from the guard, and Back on an edited
 * transaction threw the user's changes away silently. The top-bar ✕ was not guarded at all.
 */
class TransactionDraftTest {

    private val zone = ZoneId.of("UTC")
    private val noon = 1_779_019_200_000L // 2026-05-17T12:00:00Z
    private val oneMinuteLater = noon + 60_000L
    private val nextDay = noon + 24 * 60 * 60 * 1000L

    private fun draft(
        amountText: String = "0",
        currency: String = "EUR",
        type: String = "expense",
        categoryId: String? = null,
        note: String = "",
        dateMillis: Long = noon,
    ) = TransactionDraft.of(amountText, currency, type, categoryId, note, dateMillis, zone)

    private fun dirty(current: TransactionDraft, baseline: TransactionDraft?) =
        TransactionDraft.isDirty(current, baseline)

    // ── creating ─────────────────────────────────────────────────────────────────────

    @Test
    fun `an untouched new transaction is not dirty`() {
        assertFalse(dirty(draft(), draft()))
    }

    @Test
    fun `an unloaded editor is never dirty`() {
        assertFalse(dirty(draft(amountText = "9,99"), null))
    }

    @Test
    fun `typing an amount marks the form dirty`() {
        assertTrue(dirty(draft(amountText = "9,99"), draft()))
    }

    @Test
    fun `whitespace in the note is not a change`() {
        assertFalse(dirty(draft(note = "   "), draft()))
        assertTrue(dirty(draft(note = "coffee"), draft()))
    }

    @Test
    fun `switching type or category marks the form dirty`() {
        assertTrue(dirty(draft(type = "income"), draft()))
        assertTrue(dirty(draft(categoryId = "cat-food"), draft()))
    }

    @Test
    fun `the placeholder zero and an empty amount are the same amount`() {
        // The editor starts at "0" and clears to "" while typing; both parse to zero.
        assertFalse(dirty(draft(amountText = ""), draft(amountText = "0")))
    }

    // ── editing (the regression) ────────────────────────────────────────────────────

    @Test
    fun `an untouched edit is not dirty even though every field is filled`() {
        val loaded = draft(amountText = "12,50", categoryId = "cat-food", note = "lunch")
        assertFalse(dirty(loaded, loaded))
    }

    @Test
    fun `editing any field marks the form dirty, and undoing it clears that`() {
        val baseline = draft(amountText = "12,50", categoryId = "cat-food", note = "lunch")

        assertTrue(dirty(baseline.copy(amountMinor = 1300), baseline))
        assertFalse(dirty(baseline.copy(amountMinor = 1250), baseline))

        assertTrue(dirty(baseline.copy(note = "lunch with Ana"), baseline))
        assertFalse(dirty(baseline.copy(note = "lunch"), baseline))

        assertTrue(dirty(baseline.copy(categoryId = "cat-fun"), baseline))
        assertFalse(dirty(baseline.copy(categoryId = "cat-food"), baseline))
    }

    @Test
    fun `editing only the date marks the form dirty`() {
        val baseline = draft(dateMillis = noon)
        assertTrue(dirty(draft(dateMillis = nextDay), baseline))
    }

    @Test
    fun `a pure reformat of the stored amount is not a change`() {
        assertFalse(dirty(draft(amountText = "12,5"), draft(amountText = "12,50")))
        assertFalse(dirty(draft(amountText = "012,50"), draft(amountText = "12,50")))
        assertFalse(
            dirty(
                draft(amountText = "12.5", currency = "USD"),
                draft(amountText = "12.50", currency = "USD"),
            ),
        )
    }

    @Test
    fun `the time of day a stored timestamp carries is not an edit`() {
        val baseline = draft(dateMillis = noon)
        assertFalse(dirty(draft(dateMillis = oneMinuteLater), baseline))
    }

    @Test
    fun `a row whose stored category cannot be re-selected is not dirty on open`() {
        // An orphan or the Uncategorized sentinel leaves the selection null; nothing changed.
        val baseline = draft(categoryId = null)
        assertFalse(dirty(draft(categoryId = null), baseline))
    }

    // ── normalisation ───────────────────────────────────────────────────────────────

    @Test
    fun `amounts are compared in minor units`() {
        assertEquals(1250L, draft(amountText = "12,50").amountMinor)
        assertEquals(1250L, draft(amountText = "12,5").amountMinor)
        assertEquals(123456L, draft(amountText = "1.234,56").amountMinor)
        assertEquals(123456L, draft(amountText = "1,234.56", currency = "USD").amountMinor)
        assertEquals(0L, draft(amountText = "-").amountMinor)
    }

    @Test
    fun `the date key is the local calendar day`() {
        assertEquals("2026-05-17", draft(dateMillis = noon).dateKey)
        assertEquals("2026-05-17", draft(dateMillis = oneMinuteLater).dateKey)
        assertEquals("2026-05-18", draft(dateMillis = nextDay).dateKey)
    }

    @Test
    fun `the note is trimmed like the save path`() {
        assertEquals("lunch", draft(note = "  lunch  ").note)
    }
}
