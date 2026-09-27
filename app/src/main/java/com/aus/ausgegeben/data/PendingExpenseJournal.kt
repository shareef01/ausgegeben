package com.aus.ausgegeben.data

import kotlinx.coroutines.CancellationException

/**
 * One unresolved expense submission attempt: the operation id minted by
 * [TransactionPreferences.beginExpenseSubmission] and the wall-clock time it was
 * minted. Identity here is the *attempt*, never the expense's field values (DATA-1).
 *
 * The journal holds EVERY unresolved attempt (DATA-2): a second Save must never
 * overwrite the bookkeeping of a first attempt that has not resolved yet, or a process
 * death after the first write acknowledged would leave it unreconcilable — both
 * documents would exist remotely while only the second's bookkeeping survived locally.
 * The deterministic Firestore document id only deduplicates retries of the same
 * attempt; it cannot deduplicate attempt A against attempt B.
 */
data class PendingExpenseOperation(
    val operationId: String,
    val createdAt: Long,
)

/**
 * Storage-agnostic policy for the pending-submission journal, shared verbatim by the
 * production DataStore-backed implementation ([PreferenceManager]) and by test fakes,
 * so the two cannot drift: a fake must never support semantics the real implementation
 * lacks — the original single-slot journal bug was masked in tests by exactly that
 * (a list-backed fake next to a single-slot production implementation).
 */
object PendingExpenseJournal {
    /**
     * Purely a cleanup grace period — see [resolvedForRemoval]. An entry younger than
     * this is left alone on the chance its write is still in flight; it is never reused
     * to identify a submission, so this value can neither reintroduce nor fix a
     * correctness bug (DATA-1).
     */
    const val ENTRY_TTL_MS = 24 * 60 * 60 * 1000L

    /** Append one newly minted operation; all existing entries are preserved untouched. */
    fun append(
        entries: List<PendingExpenseOperation>,
        operation: PendingExpenseOperation,
    ): List<PendingExpenseOperation> = entries + operation

    /**
     * Remove exactly one operation by id. A late completion of A (its write landing
     * after B already began) removes only A — never B's entry.
     */
    fun complete(
        entries: List<PendingExpenseOperation>,
        operationId: String,
    ): List<PendingExpenseOperation> = entries.filterNot { it.operationId == operationId }

    /**
     * Decide which entries reconciliation may drop:
     *
     * - the operation's document already exists server-side — the write landed; the
     *   entry is bookkeeping only and is removed;
     * - the entry is older than [ENTRY_TTL_MS] — its write never landed (or its outcome
     *   stayed ambiguous past any realistic in-flight window) and its field values were
     *   deliberately never persisted here, so it is abandoned, never resubmitted;
     * - everything else may still be genuinely in flight and is kept.
     *
     * Server existence is checked independently per operation id. An [exists] failure
     * is treated as "not written" (the entry stays and is retried on the next
     * reconciliation); cancellation always propagates. Returns the entries to remove.
     */
    suspend fun resolvedForRemoval(
        entries: Collection<PendingExpenseOperation>,
        nowMs: Long,
        exists: suspend (String) -> Boolean,
    ): List<PendingExpenseOperation> = entries.filter { entry ->
        val alreadyWritten = try {
            exists(entry.operationId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            false
        }
        alreadyWritten || nowMs - entry.createdAt > ENTRY_TTL_MS
    }
}
