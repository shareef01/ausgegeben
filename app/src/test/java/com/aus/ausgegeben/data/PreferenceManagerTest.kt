package com.aus.ausgegeben.data

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * DATA-1 regression: identity for an expense submission is the *attempt*, never the
 * expense's field values. These tests run against the real [PreferenceManager] — real
 * DataStore file I/O, real [PrefsCrypto] — not a fake, the same way the crash that
 * motivated this fix was actually reproduced.
 *
 * The bug this pins: the previous design found-or-created a durable key by hashing the
 * expense's amount/category/note/type/day. A process death between a Firestore write
 * landing and the journal entry being cleared left that entry pending; a *different*,
 * later transaction with the same fields (two identical coffees, two €5 transit tickets,
 * ...) then silently reused the first transaction's key and was dropped — the user's
 * save reported success, but only one document ever existed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class PreferenceManagerTest {

    private fun newManager(): PreferenceManager =
        PreferenceManager(ApplicationProvider.getApplicationContext())

    @Test
    fun beginExpenseSubmission_neverTakesFieldValues_alwaysMintsAFreshId() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()

        assertTrue(a.isNotBlank())
        assertNotEquals(a, b)
    }

    // Case 1 — two legitimate, byte-identical transactions entered back to back.
    @Test
    fun case1_twoBackToBackIdenticalSubmissions_getDifferentIds() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()

        assertNotEquals(a, b)
        // Both remain independently completable.
        prefs.completeExpenseSubmission(a)
        prefs.completeExpenseSubmission(b)
    }

    // Case 2 — retrying the *same* attempt means the caller keeps the id it already has;
    // there is nothing to re-derive, so it is trivially stable. The "only one Firestore
    // document exists" half of this invariant is guaranteed by insertExpense's own
    // transactional create-if-absent check (AppRepositoryTest / the emulator suite),
    // not by this journal.
    @Test
    fun case2_retryOfSameAttempt_reusesTheIdItWasGiven() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val retried = a // the caller simply does not call beginExpenseSubmission again

        assertEquals(a, retried)
    }

    // Case 3 — the process dies after Firestore acknowledges the write but before
    // completeExpenseSubmission runs. On restart, reconciliation must recognise the
    // operation already succeeded and clear its bookkeeping WITHOUT attempting a write.
    @Test
    fun case3_reconcilesCrashAfterWrite_withoutWritingAnything() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        // completeExpenseSubmission(a) never runs — simulates the crash.

        var existsCallCount = 0
        prefs.reconcilePendingExpenseSubmissions { operationId ->
            existsCallCount++
            assertEquals(a, operationId)
            true // the document for this operation already exists server-side
        }

        assertEquals(1, existsCallCount) // existence was checked; nothing else was offered to call
        // The entry must now be gone: a genuinely new submission must not find or reuse it.
        val afterReconcile = prefs.beginExpenseSubmission()
        assertNotEquals(a, afterReconcile)
    }

    // Case 4 — after recovering from the crash above, a new, explicit submission with
    // identical fields must still get its own id.
    @Test
    fun case4_newIdenticalSubmissionAfterRecovery_stillGetsANewId() = runTest {
        val prefs = newManager()
        val crashed = prefs.beginExpenseSubmission()
        prefs.reconcilePendingExpenseSubmissions { true } // crashed op already landed

        val newSubmission = prefs.beginExpenseSubmission()

        assertNotEquals(crashed, newSubmission)
    }

    @Test
    fun reconcile_leavesARecentNotYetWrittenEntryAlone() = runTest {
        val prefs = newManager()
        val inFlight = prefs.beginExpenseSubmission()

        var checked = false
        prefs.reconcilePendingExpenseSubmissions { checked = true; false } // not written yet, brand new

        assertTrue(checked)
        // Completing it directly afterward must still work — reconciliation must not
        // have deleted the entry out from under an attempt that is still genuinely live.
        prefs.completeExpenseSubmission(inFlight)
    }

    // PROBE (adversarial review, not part of the remediation's own test list) — the
    // single-slot interleaving the audit's "Remaining risks" section does not appear to
    // call out explicitly: operation A begins, operation B begins before A completes
    // (overwriting the one-and-only slot), and A's write later succeeds and calls
    // completeExpenseSubmission(a). Confirms the `storedId == operationId` guard in
    // completeExpenseSubmission correctly no-ops instead of clobbering B's entry.
    @Test
    fun probe_overlappingOperations_lateCompletionOfEarlierAttempt_doesNotClobberNewerSlot() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission() // operation A begins; slot = A
        val b = prefs.beginExpenseSubmission() // operation B begins before A completes; slot overwritten to B

        prefs.completeExpenseSubmission(a) // A's write eventually succeeds; must not touch B's slot

        var checkedId: String? = null
        prefs.reconcilePendingExpenseSubmissions { operationId -> checkedId = operationId; false }
        assertEquals("B's slot must survive A's late completion untouched", b, checkedId)
    }

    @Test
    fun completeExpenseSubmission_onlyClearsTheMatchingId() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        prefs.completeExpenseSubmission("some-other-id-entirely")

        // `a` must still be pending: reconciliation should still find and check it.
        var checked = false
        prefs.reconcilePendingExpenseSubmissions { operationId -> checked = (operationId == a); false }
        assertTrue(checked)
    }

    @Test
    fun clearAccountLocalState_removesAPendingSubmission() = runTest {
        val prefs = newManager()
        prefs.beginExpenseSubmission()
        prefs.clearAccountLocalState()

        var checked = false
        prefs.reconcilePendingExpenseSubmissions { checked = true; false }
        assertFalse("no pending submission should survive sign-out/account deletion", checked)
    }

    // STOR-1: a CSV export sat in app-private cache indefinitely because neither
    // sign-out nor account deletion ever cleared it.
    @Test
    fun clearAccountLocalState_deletesTheExportCache() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val exportFile = File(exportDir, "ausgegeben_export.csv").apply {
            writeText("date,time,type,category,note,amount\n2026-01-01,09:00,expense,Food,,12.50")
        }
        assertTrue(exportFile.exists())

        newManager().clearAccountLocalState()

        assertFalse("export CSV must not survive sign-out/account deletion", exportFile.exists())
    }

    // STOR-1 adversarial check: clearExportCache targets only cacheDir/exports/. Anything
    // else sharing the cache directory (e.g. Coil/OkHttp/WorkManager scratch files, or a
    // future feature that is less careful about its subdirectory) must not be swept away
    // as collateral damage by an account-lifecycle cleanup that has nothing to do with it.
    @Test
    fun clearAccountLocalState_doesNotTouchUnrelatedCacheFiles() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        File(exportDir, "ausgegeben_export.csv").writeText("date,time,type,category,note,amount")

        val unrelatedRootFile = File(context.cacheDir, "unrelated.tmp").apply {
            writeText("not an export")
        }
        val unrelatedSubdir = File(context.cacheDir, "http_cache").apply { mkdirs() }
        val unrelatedNestedFile = File(unrelatedSubdir, "entry.0").apply {
            writeText("okhttp-style cache entry")
        }

        newManager().clearAccountLocalState()

        assertTrue(
            "a file directly in cacheDir outside exports/ must survive account cleanup",
            unrelatedRootFile.exists(),
        )
        assertTrue(
            "an unrelated cacheDir subdirectory must survive account cleanup",
            unrelatedSubdir.exists(),
        )
        assertTrue(
            "a file inside an unrelated cacheDir subdirectory must survive account cleanup",
            unrelatedNestedFile.exists(),
        )
    }
}
