package com.aus.ausgegeben.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * DATA-2 regression at the policy level: the journal must track every unresolved
 * submission attempt independently. These tests fail against the original single-slot
 * journal, where beginning B overwrote A's bookkeeping and made A unreconcilable even
 * if A's Firestore write had already landed (or landed later). Pure JVM — the policy
 * object has no Android dependencies, which is exactly what lets production and test
 * fakes share it verbatim.
 */
class PendingExpenseJournalTest {

    private fun op(id: String, createdAt: Long = 1_000L) = PendingExpenseOperation(id, createdAt)

    @Test
    fun append_preservesEveryUnresolvedOperation() {
        val journal = PendingExpenseJournal.append(listOf(op("a")), op("b"))

        assertEquals(listOf("a", "b"), journal.map { it.operationId })
    }

    // One late completion must never erase another operation.
    @Test
    fun complete_removesOnlyTheMatchingOperation() {
        val journal = listOf(op("a"), op("b"), op("c"))

        val updated = PendingExpenseJournal.complete(journal, "b")

        assertEquals(listOf("a", "c"), updated.map { it.operationId })
    }

    @Test
    fun complete_ofAnUnknownId_removesNothing() {
        val journal = listOf(op("a"), op("b"))

        val updated = PendingExpenseJournal.complete(journal, "not-in-journal")

        assertEquals(journal, updated)
    }

    // Server existence is checked independently per operation id; only the operations
    // whose write landed are resolved away.
    @Test
    fun reconcile_resolvesWrittenOperations_andKeepsInFlightOnes() = runTest {
        val journal = listOf(op("written"), op("in-flight"))

        val resolved = PendingExpenseJournal.resolvedForRemoval(journal, nowMs = 2_000L) { id ->
            id == "written"
        }

        assertEquals(listOf("written"), resolved.map { it.operationId })
    }

    @Test
    fun reconcile_dropsStaleUnwrittenOperations_afterTheGracePeriod() = runTest {
        val createdAt = 1_000L
        val journal = listOf(op("stale", createdAt), op("recent", createdAt + 1))

        val resolved = PendingExpenseJournal.resolvedForRemoval(
            journal,
            nowMs = createdAt + PendingExpenseJournal.ENTRY_TTL_MS + 1,
        ) { false }

        // The stale entry is abandoned (never resubmitted — the field values were never
        // persisted); the recent one may still be genuinely in flight and is kept. The
        // boundary itself (exactly ENTRY_TTL_MS old) is still inside the grace period.
        assertEquals(listOf("stale"), resolved.map { it.operationId })
    }

    @Test
    fun reconcile_entryExactlyAtTheGraceBoundary_isStillKept() = runTest {
        val createdAt = 1_000L

        val resolved = PendingExpenseJournal.resolvedForRemoval(
            listOf(op("boundary", createdAt)),
            nowMs = createdAt + PendingExpenseJournal.ENTRY_TTL_MS,
        ) { false }

        assertEquals(emptyList<PendingExpenseOperation>(), resolved)
    }

    @Test
    fun reconcile_anExistsFailure_treatsTheOperationAsNotWritten() = runTest {
        val journal = listOf(op("a"))

        val resolved = PendingExpenseJournal.resolvedForRemoval(journal, nowMs = 2_000L) {
            throw IllegalStateException("Firestore unavailable")
        }

        assertEquals(emptyList<PendingExpenseOperation>(), resolved)
    }
}
