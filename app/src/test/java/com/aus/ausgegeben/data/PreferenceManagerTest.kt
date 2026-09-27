package com.aus.ausgegeben.data

import android.app.Application
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.test.core.app.ApplicationProvider
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
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
 *
 * DATA-2 regression: the journal must track every unresolved attempt, not one. The
 * original single-slot implementation let a second submission overwrite the first's
 * bookkeeping, making the first unreconcilable even if its write had already landed.
 * These tests fail against that implementation and pass only with the multi-entry
 * journal.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class PreferenceManagerTest {

    private fun newManager(): PreferenceManager =
        PreferenceManager(ApplicationProvider.getApplicationContext())

    /**
     * Robolectric reuses this test class's sandbox, so the DataStore file (and its
     * journal entries) persist across test methods — the single-slot journal never
     * noticed because every begin overwrote the one slot. Start each test from an
     * empty store so exact-set assertions stay order-independent.
     */
    @Before
    fun resetDataStore() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        // DataStore edit runs on its own real dispatcher; block until it completes.
        runTest { context.dataStore.edit { it.clear() } }
    }

    /** Reads the journal indirectly, through reconciliation's per-entry existence checks. */
    private suspend fun PreferenceManager.pendingIdsViaReconcile(
        exists: suspend (String) -> Boolean = { false },
    ): List<String> {
        val seen = mutableListOf<String>()
        reconcilePendingExpenseSubmissions { operationId -> seen += operationId; exists(operationId) }
        return seen
    }

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

    // PROBE (adversarial review, not part of the remediation's own test list) —
    // operation A begins, operation B begins before A completes, and A's write later
    // succeeds and calls completeExpenseSubmission(a). A's late completion must not
    // clobber B's entry (DATA-2).
    @Test
    fun probe_overlappingOperations_lateCompletionOfEarlierAttempt_doesNotClobberNewerSlot() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()

        prefs.completeExpenseSubmission(a)

        assertEquals("B's entry must survive A's late completion untouched", listOf(b), prefs.pendingIdsViaReconcile())
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

    // ---- DATA-2: the journal tracks every unresolved operation independently --------

    // The audit's headline failure: A unresolved (its write may have landed; the
    // acknowledgement was lost), then B begins and succeeds. A must remain
    // reconcilable. On the single-slot journal B overwrote A and A vanished.
    @Test
    fun data2_aPending_bBeginsAndCompletes_aStaysPendingForReconciliation() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()
        assertNotEquals(a, b)

        prefs.completeExpenseSubmission(b)

        assertEquals("A must still exist for reconciliation after B completed", listOf(a), prefs.pendingIdsViaReconcile())
    }

    @Test
    fun data2_reconciliationChecksEachOperationIndependently_andResolvesOnlyWrittenOnes() = runTest {
        val prefs = newManager()
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()

        // Only A's document exists server-side; B may still be genuinely in flight.
        assertEquals("each unresolved operation is existence-checked independently", setOf(a, b), prefs.pendingIdsViaReconcile { it == a }.toSet())
        assertEquals("A's bookkeeping clears independently; B stays", listOf(b), prefs.pendingIdsViaReconcile())

        // B completes normally; nothing unresolved remains, so a later reconcile
        // existence-checks nothing at all.
        prefs.completeExpenseSubmission(b)
        assertTrue(prefs.pendingIdsViaReconcile { true }.isEmpty())
    }

    @Test
    fun data2_twoExplicitActions_stayTwoIndependentOperationsThroughReconciliation() = runTest {
        val prefs = newManager()
        // Two explicit Save taps, byte-identical fields — two legitimate records.
        val a = prefs.beginExpenseSubmission()
        val b = prefs.beginExpenseSubmission()

        // Both writes landed; the acknowledgement for the bookkeeping was lost both
        // times (process death). Reconciliation must resolve exactly these two
        // operations — the journal never collapses them into one and never invents a
        // third: two explicit actions map to exactly two remote records, deduplicated
        // per id by insertExpense's create-if-absent guard.
        val written = setOf(a, b)
        assertEquals(written, prefs.pendingIdsViaReconcile { it in written }.toSet())
        assertTrue(prefs.pendingIdsViaReconcile { true }.isEmpty())
    }

    // Migration from the pre-DATA-2 single-slot journal: an upgraded install with an
    // unresolved legacy entry must keep it — beginning a new submission must not
    // silently drop it, and it must be reconcilable exactly like a native entry.
    @Test
    fun data2_migration_legacySingleSlotEntry_survivesAndIsTracked() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val legacyId = "legacy-operation-id"
        val legacyCreatedAt = System.currentTimeMillis()
        // Seed the exact storage state the previous app version could have left behind
        // (single-slot keys, sealed with the same crypto the manager uses).
        val crypto = PrefsCrypto()
        context.dataStore.edit { prefs ->
            prefs[stringPreferencesKey("pending_expense_operation_id_enc")] = crypto.seal(legacyId)
            prefs[stringPreferencesKey("pending_expense_created_at_enc")] = crypto.seal(legacyCreatedAt.toString())
        }

        val prefs = newManager()
        val newId = prefs.beginExpenseSubmission()

        assertEquals(
            "both the legacy entry and the new submission are tracked independently",
            setOf(legacyId, newId),
            prefs.pendingIdsViaReconcile().toSet(),
        )

        // Completing the legacy entry removes only it.
        prefs.completeExpenseSubmission(legacyId)
        assertEquals(listOf(newId), prefs.pendingIdsViaReconcile())
    }

    @Test
    fun data2_migration_legacyOperationAlreadyWritten_isResolvedOnFirstReconcile() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val legacyId = "legacy-operation-id"
        val crypto = PrefsCrypto()
        context.dataStore.edit { prefs ->
            prefs[stringPreferencesKey("pending_expense_operation_id_enc")] = crypto.seal(legacyId)
            prefs[stringPreferencesKey("pending_expense_created_at_enc")] =
                crypto.seal(System.currentTimeMillis().toString())
        }

        val prefs = newManager()
        // First reconciliation existence-checks the legacy entry and resolves it away
        // (its write already landed); the second pass must find nothing left to check.
        assertEquals(listOf(legacyId), prefs.pendingIdsViaReconcile { it == legacyId })
        assertTrue("the legacy write already landed; its bookkeeping resolves away", prefs.pendingIdsViaReconcile { true }.isEmpty())
        assertTrue(prefs.pendingIdsViaReconcile { true }.isEmpty())
    }

    @Test
    fun data2_migration_legacyKeysAreRemovedOnceFoldedIn() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val crypto = PrefsCrypto()
        context.dataStore.edit { prefs ->
            prefs[stringPreferencesKey("pending_expense_operation_id_enc")] = crypto.seal("legacy-id")
            prefs[stringPreferencesKey("pending_expense_created_at_enc")] =
                crypto.seal(System.currentTimeMillis().toString())
        }

        newManager().beginExpenseSubmission()

        // The legacy keys must not linger after migration.
        context.dataStore.edit { prefs ->
            assertFalse(prefs.contains(stringPreferencesKey("pending_expense_operation_id_enc")))
            assertFalse(prefs.contains(stringPreferencesKey("pending_expense_created_at_enc")))
        }
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
    fun clearAccountLocalState_deletesTheExportCache() = runTest {        val context = ApplicationProvider.getApplicationContext<Application>()
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

    // STOR-2: a sealed preference that exists but cannot be decrypted must never flow
    // into a CLOUD WRITE as its default — the sync snapshot throws so callers can
    // refuse the push, while display-facing reads stay lenient (the app stays usable).
    @Test
    fun stor2_corruptedSealedBudget_refusesSyncSnapshot_butLenientReadStaysUsable() = runTest {
        val context = ApplicationProvider.getApplicationContext<Application>()
        // Seed a sealed-format blob that cannot be decrypted (corrupted ciphertext or
        // a lost Keystore key). The literal enc: prefix is the corruption marker the
        // production writer produces.
        context.dataStore.edit { prefs ->
            prefs[stringPreferencesKey("monthly_budget")] = "enc:not-valid-ciphertext"
        }

        val prefs = newManager()
        val thrown = runCatching { prefs.snapshotSyncedPreferences() }.exceptionOrNull()
        assertTrue(
            "sync snapshot must refuse on an unreadable sealed value, but threw: $thrown",
            thrown is PrefsCrypto.SealedValueUnreadableException,
        )
        // The lenient display path still behaves: budget reads as absent, no crash.
        assertNull(prefs.monthlyBudgetFlow.first())
    }
}
